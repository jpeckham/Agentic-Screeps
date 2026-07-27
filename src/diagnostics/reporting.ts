import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { DiagnosticConfig } from "./config.js";
import type { DiagnosticRunMetrics } from "./metrics.js";
import type { DiagnosticFinding } from "./rules.js";
import type { DiagnosticEvent } from "./telemetry.js";

export interface DiagnosticReportInput {
  outputRoot: string;
  runId: string;
  scenarioId: string;
  codeVersion: string;
  config: DiagnosticConfig;
  outcome: "passed" | "failed";
  metrics: DiagnosticRunMetrics;
  findings: DiagnosticFinding[];
  events: DiagnosticEvent[];
  invariantViolations: string[];
  artifactReferences: string[];
}

export interface DiagnosticReportResult {
  jsonPath: string;
  markdownPath: string;
}

export async function writeDiagnosticReports(input: DiagnosticReportInput): Promise<DiagnosticReportResult> {
  const outputDir = join(input.outputRoot, input.runId);
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "diagnostic-report.json");
  const markdownPath = join(outputDir, "diagnostic-report.md");
  await writeFile(jsonPath, `${JSON.stringify(toJsonReport(input), null, 2)}\n`, "utf8");
  await writeFile(markdownPath, formatMarkdownReport(input), "utf8");
  return { jsonPath, markdownPath };
}

function toJsonReport(input: DiagnosticReportInput): Record<string, unknown> {
  return {
    metadata: {
      runId: input.runId,
      scenarioId: input.scenarioId,
      codeVersion: input.codeVersion
    },
    scenario: {
      id: input.scenarioId
    },
    configuration: input.config,
    outcome: input.outcome,
    metrics: input.metrics,
    findings: input.findings,
    invariantViolations: input.invariantViolations,
    artifactReferences: input.artifactReferences
  };
}

function formatMarkdownReport(input: DiagnosticReportInput): string {
  const lines = [
    `# Diagnostic Report: ${input.scenarioId}`,
    "",
    `Outcome: ${input.outcome}`,
    `Run: ${input.runId}`,
    "",
    "## Timeline",
    ...input.events
      .slice()
      .sort((left, right) => left.gameTick - right.gameTick)
      .map((event) => `- Tick ${event.gameTick}: ${event.eventType}`),
    "",
    "## Baseline",
    `- Baseline hauling capacity: ${input.metrics.baselineHaulingCapacity}`,
    "",
    "## Observed Degradation",
    `- Lowest hauling capacity after loss: ${input.metrics.lowestHaulingCapacityAfterHaulerLoss}`,
    `- Maximum source-container fullness: ${input.metrics.maximumSourceContainerFullness}`,
    `- Blocked miner harvest ticks: ${input.metrics.blockedMinerHarvestTicks}`,
    "",
    "## Recovery",
    `- Ticks until recovery: ${input.metrics.ticksUntilRecovery}`,
    "",
    "## Findings"
  ];

  for (const finding of input.findings) {
    lines.push(`- ${finding.ruleId}: ${finding.title}`);
    lines.push(`  ${finding.summary}`);
  }

  lines.push("", "## Ranked Hypotheses");
  for (const hypothesis of input.findings.flatMap((finding) => finding.hypotheses).sort((left, right) => right.confidenceScore - left.confidenceScore)) {
    lines.push(`- ${hypothesis.confidenceScore}: ${hypothesis.cause}`);
  }

  lines.push("", "## Recommended Investigation");
  for (const item of new Set(input.findings.flatMap((finding) => finding.recommendedInvestigation))) {
    lines.push(`- ${item}`);
  }

  return `${lines.join("\n")}\n`;
}
