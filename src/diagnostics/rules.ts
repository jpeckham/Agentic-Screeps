import type { DiagnosticConfig } from "./config.js";
import type { DiagnosticRunMetrics } from "./metrics.js";
import type { DiagnosticTelemetry, MetricSample } from "./telemetry.js";

export type DiagnosticSeverity = "critical" | "high" | "medium" | "low" | "informational";
export type DiagnosticConfidence = "high" | "medium" | "low";

export interface DiagnosticFinding {
  findingId: string;
  runId: string;
  scenarioId: string;
  ruleId: string;
  severity: DiagnosticSeverity;
  confidence: DiagnosticConfidence;
  title: string;
  summary: string;
  firstObservedTick: number;
  lastObservedTick: number;
  affectedRoom?: string;
  observations: DiagnosticObservation[];
  hypotheses: DiagnosticHypothesis[];
  recommendedInvestigation: string[];
}

export interface DiagnosticObservation {
  description: string;
  metricName?: string;
  observedValue?: number;
  expectedValue?: number;
  tickRange?: {
    from: number;
    to: number;
  };
}

export interface DiagnosticHypothesis {
  cause: string;
  confidenceScore: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
}

export function evaluateDiagnosticRules(
  telemetry: DiagnosticTelemetry,
  metrics: DiagnosticRunMetrics,
  config: DiagnosticConfig
): DiagnosticFinding[] {
  const findings = [
    evaluateCapacityDeficit(telemetry, config),
    evaluateSourceBackpressure(telemetry, metrics, config),
    evaluateDelayedReplacement(telemetry, config)
  ].filter((finding): finding is DiagnosticFinding => finding !== undefined);

  const correlated = evaluateCorrelatedRootCause(telemetry, metrics, findings);
  return correlated ? [...findings, correlated] : findings;
}

function evaluateCapacityDeficit(
  telemetry: DiagnosticTelemetry,
  config: DiagnosticConfig
): DiagnosticFinding | undefined {
  const samplesByTick = pairByTick(
    samples(telemetry, "logistics.activeHaulingCapacity"),
    samples(telemetry, "logistics.requiredHaulingCapacity")
  );
  const deficitTicks = samplesByTick.filter((pair) => pair.active.value < pair.required.value);
  const range = longestConsecutive(deficitTicks.map((pair) => pair.tick));
  if (!range || range.duration <= config.capacityDeficitToleranceTicks) return undefined;
  const worst = Math.max(...deficitTicks.map((pair) => pair.required.value - pair.active.value));
  const base = baseFinding(telemetry, "LOGISTICS_HAULING_CAPACITY_DEFICIT", range.from, range.to);
  return {
    ...base,
    severity: "high",
    confidence: "high",
    title: "Hauling capacity deficit",
    summary: `Active hauling capacity stayed below required capacity for ${range.duration} ticks.`,
    ...optionalAffectedRoom(deficitTicks[0]?.active.roomName),
    observations: [
      {
        description: "Active hauling capacity fell below required capacity.",
        metricName: "logistics.activeHaulingCapacity",
        observedValue: worst,
        expectedValue: 0,
        tickRange: range
      }
    ],
    hypotheses: [
      {
        cause: "The colony had insufficient active hauling capacity for current source throughput.",
        confidenceScore: 0.9,
        supportingEvidence: [`Worst capacity deficit was ${worst}.`],
        contradictingEvidence: []
      }
    ],
    recommendedInvestigation: ["Inspect hauler loss, replacement timing, and spawn queue priority."]
  };
}

function evaluateSourceBackpressure(
  telemetry: DiagnosticTelemetry,
  metrics: DiagnosticRunMetrics,
  config: DiagnosticConfig
): DiagnosticFinding | undefined {
  const highTicks = samples(telemetry, "source.containerFullness")
    .filter((sample) => sample.value > config.sourceBackpressureThreshold)
    .map((sample) => sample.gameTick);
  const range = longestConsecutive(highTicks);
  if (!range || range.duration <= config.sourceBackpressureDurationTicks) return undefined;
  const base = baseFinding(telemetry, "LOGISTICS_SOURCE_BACKPRESSURE", range.from, range.to);
  return {
    ...base,
    severity: "high",
    confidence: "high",
    title: "Source container backpressure",
    summary: `A source container stayed above ${config.sourceBackpressureThreshold * 100}% fullness for ${range.duration} ticks.`,
    ...optionalAffectedRoom(samples(telemetry, "source.containerFullness")[0]?.roomName),
    observations: [
      {
        description: "Source-container fullness exceeded the backpressure threshold.",
        metricName: "source.containerFullness",
        observedValue: metrics.maximumSourceContainerFullness,
        expectedValue: config.sourceBackpressureThreshold,
        tickRange: range
      },
      {
        description: "Miner harvest interruptions were observed while containers were full.",
        metricName: "source.blockedHarvestTicks",
        observedValue: metrics.blockedMinerHarvestTicks,
        expectedValue: 0,
        tickRange: range
      }
    ],
    hypotheses: [
      {
        cause: "Energy accumulated at the sources faster than haulers removed it.",
        confidenceScore: 0.88,
        supportingEvidence: [
          `Maximum fullness was ${metrics.maximumSourceContainerFullness}.`,
          `${metrics.blockedMinerHarvestTicks} blocked harvest ticks were recorded.`
        ],
        contradictingEvidence: []
      }
    ],
    recommendedInvestigation: ["Inspect source-container haul pickup cadence and miner idle reasons."]
  };
}

function evaluateDelayedReplacement(
  telemetry: DiagnosticTelemetry,
  config: DiagnosticConfig
): DiagnosticFinding | undefined {
  const lossTick = firstEventTick(telemetry, "hauler_lost");
  const requestedTick = firstEventTick(telemetry, "hauler_replacement_requested");
  const startedTick = firstEventTick(telemetry, "hauler_replacement_started");
  const spawnedTick = firstEventTick(telemetry, "hauler_replacement_spawned");
  if (lossTick === undefined || requestedTick === undefined || startedTick === undefined) return undefined;
  const requestDelay = requestedTick - lossTick;
  const spawnDelay = startedTick - requestedTick;
  if (
    requestDelay <= config.criticalReplacementRequestToleranceTicks &&
    spawnDelay <= config.criticalReplacementSpawnToleranceTicks
  ) {
    return undefined;
  }
  const base = baseFinding(telemetry, "SPAWN_DELAYED_CRITICAL_HAULER_REPLACEMENT", lossTick, spawnedTick ?? startedTick);
  return {
    ...base,
    severity: "high",
    confidence: "high",
    title: "Delayed critical hauler replacement",
    summary: `Critical hauler replacement request delay was ${requestDelay} ticks and spawn delay was ${spawnDelay} ticks.`,
    ...optionalAffectedRoom(telemetry.events.find((event) => event.roomName)?.roomName),
    observations: [
      { description: "Critical hauler was lost.", observedValue: lossTick },
      { description: "Replacement request was created.", observedValue: requestedTick },
      { description: "Replacement spawning began.", observedValue: startedTick },
      ...(spawnedTick === undefined ? [] : [{ description: "Replacement spawned.", observedValue: spawnedTick }])
    ],
    hypotheses: [
      {
        cause: "Critical hauler replacement exceeded configured request or spawn tolerances.",
        confidenceScore: 0.9,
        supportingEvidence: [
          `request delay ${requestDelay}/${config.criticalReplacementRequestToleranceTicks}`,
          `spawn delay ${spawnDelay}/${config.criticalReplacementSpawnToleranceTicks}`,
          ...queuedAheadEvidence(telemetry)
        ],
        contradictingEvidence: []
      }
    ],
    recommendedInvestigation: ["Inspect spawn queue ordering and hauler request priority."]
  };
}

function evaluateCorrelatedRootCause(
  telemetry: DiagnosticTelemetry,
  metrics: DiagnosticRunMetrics,
  findings: DiagnosticFinding[]
): DiagnosticFinding | undefined {
  const deficit = findings.find((finding) => finding.ruleId === "LOGISTICS_HAULING_CAPACITY_DEFICIT");
  const backpressure = findings.find((finding) => finding.ruleId === "LOGISTICS_SOURCE_BACKPRESSURE");
  const delayed = findings.find((finding) => finding.ruleId === "SPAWN_DELAYED_CRITICAL_HAULER_REPLACEMENT");
  if (!deficit || !backpressure || !delayed) return undefined;
  if (!(deficit.firstObservedTick <= backpressure.firstObservedTick && backpressure.firstObservedTick <= delayed.lastObservedTick)) {
    return undefined;
  }

  const score = confidenceScore([
    true,
    metrics.maximumSourceContainerFullness > 0.95,
    metrics.blockedMinerHarvestTicks > 0,
    queuedAheadEvidence(telemetry).length > 0
  ]);
  const primaryCause = "Critical hauling capacity was not restored quickly enough after the hauler loss, causing energy to accumulate at the sources and interrupt mining.";
  const hypotheses: DiagnosticHypothesis[] = [
    {
      cause: primaryCause,
      confidenceScore: score,
      supportingEvidence: [
        "Capacity deficit preceded source backpressure.",
        "Delayed replacement overlapped the degraded logistics window.",
        `${metrics.blockedMinerHarvestTicks} blocked miner harvest ticks were recorded.`
      ],
      contradictingEvidence: []
    }
  ];
  if (queuedAheadEvidence(telemetry).length > 0) {
    hypotheses.push({
      cause: "Spawn-request prioritization delayed logistics recovery.",
      confidenceScore: 0.7,
      supportingEvidence: queuedAheadEvidence(telemetry),
      contradictingEvidence: []
    });
  }

  return {
    ...baseFinding(telemetry, "LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT", deficit.firstObservedTick, backpressure.lastObservedTick),
    severity: "critical",
    confidence: score >= 0.8 ? "high" : score >= 0.6 ? "medium" : "low",
    title: "Backpressure caused by delayed hauler replacement",
    summary: primaryCause,
    ...optionalAffectedRoom(deficit.affectedRoom ?? backpressure.affectedRoom),
    observations: [
      ...deficit.observations,
      ...backpressure.observations,
      ...delayed.observations
    ],
    hypotheses,
    recommendedInvestigation: [
      "Review spawn queue priority for critical logistics creeps.",
      "Compare replacement request tick with hauler loss tick.",
      "Inspect source container fullness and miner blocked ticks during the deficit."
    ]
  };
}

function baseFinding(
  telemetry: DiagnosticTelemetry,
  ruleId: string,
  firstObservedTick: number,
  lastObservedTick: number
): Pick<DiagnosticFinding, "findingId" | "runId" | "scenarioId" | "ruleId" | "firstObservedTick" | "lastObservedTick"> {
  const first = telemetry.events[0] ?? telemetry.metrics[0];
  return {
    findingId: `${first?.runId ?? "run"}:${ruleId}`,
    runId: first?.runId ?? "",
    scenarioId: first?.scenarioId ?? "",
    ruleId,
    firstObservedTick,
    lastObservedTick
  };
}

function optionalAffectedRoom(roomName: string | undefined): Pick<DiagnosticFinding, "affectedRoom"> | Record<string, never> {
  return roomName ? { affectedRoom: roomName } : {};
}

function samples(telemetry: DiagnosticTelemetry, metricName: string): MetricSample[] {
  return telemetry.metrics
    .filter((sample) => sample.metricName === metricName)
    .sort((left, right) => left.gameTick - right.gameTick);
}

function firstEventTick(telemetry: DiagnosticTelemetry, eventType: string): number | undefined {
  return telemetry.events
    .filter((event) => event.eventType === eventType)
    .sort((left, right) => left.gameTick - right.gameTick)[0]?.gameTick;
}

function pairByTick(
  active: MetricSample[],
  required: MetricSample[]
): Array<{ tick: number; active: MetricSample; required: MetricSample }> {
  const requiredByTick = new Map(required.map((sample) => [sample.gameTick, sample]));
  return active
    .map((sample) => ({ tick: sample.gameTick, active: sample, required: requiredByTick.get(sample.gameTick) }))
    .filter((pair): pair is { tick: number; active: MetricSample; required: MetricSample } => pair.required !== undefined);
}

function longestConsecutive(ticks: number[]): { from: number; to: number; duration: number } | undefined {
  const ordered = [...new Set(ticks)].sort((left, right) => left - right);
  let best: { from: number; to: number; duration: number } | undefined;
  let current: { from: number; to: number; duration: number } | undefined;
  for (const tick of ordered) {
    if (!current || tick !== current.to + 1) {
      current = { from: tick, to: tick, duration: 1 };
    } else {
      current = { ...current, to: tick, duration: current.duration + 1 };
    }
    if (!best || current.duration > best.duration) best = current;
  }
  return best;
}

function queuedAheadEvidence(telemetry: DiagnosticTelemetry): string[] {
  return telemetry.events
    .filter((event) => event.eventType === "hauler_replacement_requested" && typeof event.context?.queuedAhead === "number")
    .map((event) => `${event.context?.queuedAhead} spawn request(s) were ahead of the replacement hauler.`);
}

function confidenceScore(evidence: boolean[]): number {
  const weights = [0.35, 0.25, 0.25, 0.15];
  return Number(evidence.reduce((score, present, index) => score + (present ? weights[index] ?? 0 : 0), 0).toFixed(2));
}
