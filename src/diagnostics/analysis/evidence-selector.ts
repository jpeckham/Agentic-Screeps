import {
  DEFAULT_ANALYSIS_CONTEXT_LIMITS,
  type AnalysisContextLimits,
  type AnalysisEvidence,
  type AnalysisFindingInput,
  type AnalysisMetricInput,
  type AnalysisTimelineEvent
} from "./analysis-contracts.js";
import type { DiagnosticReport, DiagnosticReportFinding } from "./report-types.js";

export interface SelectedDiagnosticEvidence {
  findings: AnalysisFindingInput[];
  metrics: AnalysisMetricInput[];
  timeline: AnalysisTimelineEvent[];
  evidence: AnalysisEvidence[];
  omittedEvidenceSummary: string;
  limits: Required<AnalysisContextLimits>;
}

export function selectEvidenceForAnalysis(
  report: DiagnosticReport,
  limits: AnalysisContextLimits = {}
): SelectedDiagnosticEvidence {
  const resolved = { ...DEFAULT_ANALYSIS_CONTEXT_LIMITS, ...limits };
  const allFindings = report.findings ?? [];
  const selectedFindings = allFindings.slice(0, resolved.maxFindings);
  const findingEvidence = selectedFindings.map((finding, index): AnalysisEvidence => ({
    evidenceId: evidenceId("FINDING", index),
    evidenceType: "finding",
    description: `${finding.ruleId}: ${finding.summary}`,
    firstTick: finding.firstObservedTick,
    lastTick: finding.lastObservedTick
  }));

  const observationEvidence = selectedFindings.flatMap((finding, findingIndex) =>
    (finding.observations ?? [])
      .slice(0, resolved.maxObservationsPerFinding)
      .map((observation, observationIndex): AnalysisEvidence => ({
        evidenceId: evidenceId("OBS", observationGlobalIndex(selectedFindings, findingIndex, observationIndex)),
        evidenceType: "observation",
        description: `${finding.ruleId}: ${observation.description ?? finding.summary}`,
        value: observation.observedValue,
        unit: observation.metricName,
        firstTick: observation.tickRange?.from ?? finding.firstObservedTick,
        lastTick: observation.tickRange?.to ?? finding.lastObservedTick
      }))
  );

  const allMetricEvidence = metricEvidence(report);
  const preservedContradictory = allMetricEvidence.filter(isContradictoryMetric);
  const selectedMetricEvidence = uniqueEvidence([
    ...allMetricEvidence.slice(0, resolved.maxMetrics),
    ...preservedContradictory
  ]);
  const selectedMetrics = selectedMetricEvidence.map((item): AnalysisMetricInput => ({
    evidenceId: item.evidenceId,
    metricName: metricNameFromDescription(item.description),
    value: item.value ?? "",
    unit: item.unit,
    description: item.description
  }));

  const timelineEvidence = timelineFromFindings(selectedFindings).slice(0, resolved.maxTimelineEvents);
  const configurationEvidence = Object.entries(report.configuration ?? {}).map(([name, value], index): AnalysisEvidence => ({
    evidenceId: evidenceId("CONFIG", index),
    evidenceType: "configuration",
    description: `${name} configured as ${String(value)}`,
    value
  }));
  const evidence = uniqueEvidence([
    ...findingEvidence,
    ...observationEvidence,
    ...selectedMetricEvidence,
    ...timelineEvidence.map(timelineEvidenceItem),
    ...configurationEvidence
  ]);

  return {
    findings: selectedFindings.map((finding, index) => findingInput(finding, index, observationEvidence)),
    metrics: selectedMetrics,
    timeline: timelineEvidence,
    evidence,
    omittedEvidenceSummary: omittedSummary(report, resolved, selectedFindings.length, selectedMetricEvidence.length, timelineEvidence.length),
    limits: resolved
  };
}

function findingInput(
  finding: DiagnosticReportFinding,
  index: number,
  observations: AnalysisEvidence[]
): AnalysisFindingInput {
  const ownObservationIds = observations
    .filter((item) => item.description.startsWith(`${finding.ruleId}:`))
    .map((item) => item.evidenceId);
  return {
    findingId: finding.findingId,
    ruleId: finding.ruleId,
    severity: finding.severity,
    confidence: finding.confidence,
    title: finding.title,
    summary: finding.summary,
    firstObservedTick: finding.firstObservedTick,
    lastObservedTick: finding.lastObservedTick,
    affectedRoom: finding.affectedRoom,
    citedEvidenceIds: [evidenceId("FINDING", index), ...ownObservationIds]
  };
}

function metricEvidence(report: DiagnosticReport): AnalysisEvidence[] {
  const metricOrder = [
    "baselineHaulingCapacity",
    "lowestHaulingCapacityAfterHaulerLoss",
    "totalReplacementGap",
    "maximumSourceContainerFullness",
    "replacementRequestDelay",
    "replacementSpawnDelay",
    "blockedMinerHarvestTicks",
    "ticksAbove80SourceContainerFullness",
    "ticksAbove95SourceContainerFullness",
    "energyDeliveredBeforeFailure",
    "energyDeliveredDuringDegradation",
    "energyDeliveredAfterRecovery",
    "ticksUntilRecovery"
  ];
  const metrics = report.metrics ?? {};
  return metricOrder
    .filter((name) => metrics[name] !== undefined)
    .map((name, index): AnalysisEvidence => ({
      evidenceId: evidenceId("METRIC", index),
      evidenceType: "metric",
      description: metricDescription(name, metrics[name] ?? 0),
      value: metrics[name] ?? 0,
      unit: metricUnit(name)
    }));
}

function metricDescription(name: string, value: number): string {
  if (name === "blockedMinerHarvestTicks" && value === 0) {
    return `${name} is 0 and contradicts source backpressure from blocked mining.`;
  }
  if (name === "maximumSourceContainerFullness" && value < 0.8) {
    return `${name} is ${value}, below the source backpressure threshold.`;
  }
  return `${name} is ${value}.`;
}

function metricUnit(name: string): string | undefined {
  if (name.includes("Ticks") || name.includes("Delay") || name.includes("Gap")) return "ticks";
  if (name.includes("Fullness")) return "ratio";
  if (name.includes("Capacity")) return "carry-parts";
  return undefined;
}

function timelineFromFindings(findings: DiagnosticReportFinding[]): AnalysisTimelineEvent[] {
  const events: AnalysisTimelineEvent[] = [];
  for (const finding of findings) {
    if (finding.firstObservedTick !== undefined) {
      events.push({
        evidenceId: evidenceId("EVENT", events.length),
        tick: finding.firstObservedTick,
        eventType: `${finding.ruleId}_FIRST_OBSERVED`,
        description: `${finding.ruleId} first observed at tick ${finding.firstObservedTick}.`
      });
    }
    if (finding.lastObservedTick !== undefined && finding.lastObservedTick !== finding.firstObservedTick) {
      events.push({
        evidenceId: evidenceId("EVENT", events.length),
        tick: finding.lastObservedTick,
        eventType: `${finding.ruleId}_LAST_OBSERVED`,
        description: `${finding.ruleId} last observed at tick ${finding.lastObservedTick}.`
      });
    }
  }
  return events.sort((left, right) => left.tick - right.tick).map((event, index) => ({
    ...event,
    evidenceId: evidenceId("EVENT", index)
  }));
}

function timelineEvidenceItem(event: AnalysisTimelineEvent): AnalysisEvidence {
  return {
    evidenceId: event.evidenceId,
    evidenceType: "timeline",
    description: event.description,
    firstTick: event.tick,
    lastTick: event.tick
  };
}

function observationGlobalIndex(findings: DiagnosticReportFinding[], findingIndex: number, observationIndex: number): number {
  return findings
    .slice(0, findingIndex)
    .reduce((total, finding) => total + (finding.observations ?? []).length, 0) + observationIndex;
}

function isContradictoryMetric(item: AnalysisEvidence): boolean {
  return item.description.includes("contradicts");
}

function metricNameFromDescription(description: string): string {
  return description.split(" ")[0] ?? description;
}

function uniqueEvidence(items: AnalysisEvidence[]): AnalysisEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.evidenceId)) return false;
    seen.add(item.evidenceId);
    return true;
  });
}

function omittedSummary(
  report: DiagnosticReport,
  limits: Required<AnalysisContextLimits>,
  selectedFindings: number,
  selectedMetrics: number,
  selectedTimeline: number
): string {
  const findingsOmitted = Math.max(0, (report.findings ?? []).length - selectedFindings);
  const metricsOmitted = Math.max(0, Object.keys(report.metrics ?? {}).length - selectedMetrics);
  const possibleTimeline = (report.findings ?? []).length * 2;
  const timelineOmitted = Math.max(0, possibleTimeline - selectedTimeline);
  const parts = [
    `${findingsOmitted} finding(s) omitted by maxFindings=${limits.maxFindings}`,
    `${metricsOmitted} metric(s) omitted by maxMetrics=${limits.maxMetrics}`,
    `${timelineOmitted} timeline event(s) omitted by maxTimelineEvents=${limits.maxTimelineEvents}`
  ];
  return parts.join("; ");
}

function evidenceId(prefix: string, zeroBasedIndex: number): string {
  return `${prefix}-${String(zeroBasedIndex + 1).padStart(3, "0")}`;
}
