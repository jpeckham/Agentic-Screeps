import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { DEFAULT_DIAGNOSTIC_CONFIG } from "../../src/diagnostics/config.js";
import { calculateDiagnosticMetrics } from "../../src/diagnostics/metrics.js";
import { evaluateDiagnosticRules } from "../../src/diagnostics/rules.js";
import { writeDiagnosticReports } from "../../src/diagnostics/reporting.js";
import {
  SimulationDiagnosticRecorder,
  type DiagnosticEvent,
  type MetricSample
} from "../../src/diagnostics/telemetry.js";
import {
  createCriticalHaulerLossScenario,
  runCriticalHaulerLossScenario
} from "../../src/private-testing/critical-hauler-loss-scenario.js";

describe("diagnostic telemetry contracts", () => {
  test("serializes events and metrics as stable plain JSON", () => {
    const recorder = new SimulationDiagnosticRecorder();
    const event: DiagnosticEvent = {
      runId: "run-1",
      scenarioId: "critical-hauler-loss",
      gameTick: 200,
      roomName: "W1N1",
      subsystem: "logistics",
      eventType: "hauler_lost",
      entityId: "hauler-1",
      measurements: { carryParts: 6 },
      context: { critical: true, reason: "scenario" },
      codeVersion: "test"
    };
    const metric: MetricSample = {
      runId: "run-1",
      scenarioId: "critical-hauler-loss",
      gameTick: 201,
      roomName: "W1N1",
      metricName: "logistics.activeHaulingCapacity",
      value: 6,
      unit: "carry-parts",
      dimensions: { role: "hauler" }
    };

    recorder.recordEvent(event);
    recorder.recordMetric(metric);

    expect(JSON.parse(JSON.stringify(recorder.flush()))).toEqual({
      events: [event],
      metrics: [metric]
    });
  });
});

describe("diagnostic metrics", () => {
  test("derives run-level metrics from fixed telemetry samples", () => {
    const telemetry = runCriticalHaulerLossScenario(createCriticalHaulerLossScenario({
      runId: "run-metrics",
      replacementRequestDelayTicks: 38,
      replacementSpawnDelayTicks: 22
    })).telemetry;

    const metrics = calculateDiagnosticMetrics(telemetry, DEFAULT_DIAGNOSTIC_CONFIG);

    expect(metrics.baselineHaulingCapacity).toBe(12);
    expect(metrics.lowestHaulingCapacityAfterHaulerLoss).toBe(6);
    expect(metrics.replacementRequestDelay).toBe(38);
    expect(metrics.replacementSpawnDelay).toBe(22);
    expect(metrics.totalReplacementGap).toBe(78);
    expect(metrics.maximumSourceContainerFullness).toBeGreaterThanOrEqual(0.96);
    expect(metrics.ticksAbove80SourceContainerFullness).toBeGreaterThan(0);
    expect(metrics.ticksAbove95SourceContainerFullness).toBeGreaterThan(0);
    expect(metrics.blockedMinerHarvestTicks).toBeGreaterThan(0);
    expect(metrics.energyDeliveredBeforeFailure).toBeGreaterThan(metrics.energyDeliveredDuringDegradation);
    expect(metrics.energyDeliveredAfterRecovery).toBeGreaterThan(0);
    expect(metrics.ticksUntilRecovery).toBeGreaterThan(0);
  });
});

describe("diagnostic rules", () => {
  test("produces all expected findings for delayed critical hauler replacement", () => {
    const result = runCriticalHaulerLossScenario(createCriticalHaulerLossScenario({
      runId: "run-delayed",
      replacementRequestDelayTicks: 38,
      replacementSpawnDelayTicks: 22
    }));
    const metrics = calculateDiagnosticMetrics(result.telemetry, result.config);
    const findings = evaluateDiagnosticRules(result.telemetry, metrics, result.config);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "LOGISTICS_HAULING_CAPACITY_DEFICIT",
      "LOGISTICS_SOURCE_BACKPRESSURE",
      "SPAWN_DELAYED_CRITICAL_HAULER_REPLACEMENT",
      "LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT"
    ]);
    expect(findings.at(-1)?.hypotheses[0]).toMatchObject({
      cause: "Critical hauling capacity was not restored quickly enough after the hauler loss, causing energy to accumulate at the sources and interrupt mining."
    });
    expect(findings.at(-1)?.confidence).toBe("high");
  });

  test("does not trigger deficit or backpressure at exact boundary durations", () => {
    const result = runCriticalHaulerLossScenario(createCriticalHaulerLossScenario({
      runId: "run-boundary",
      replacementRequestDelayTicks: 0,
      replacementSpawnDelayTicks: 0,
      degradedTicksOverride: DEFAULT_DIAGNOSTIC_CONFIG.capacityDeficitToleranceTicks
    }));
    const metrics = calculateDiagnosticMetrics(result.telemetry, result.config);
    const findings = evaluateDiagnosticRules(result.telemetry, metrics, result.config);

    expect(findings.map((finding) => finding.ruleId)).not.toContain("LOGISTICS_HAULING_CAPACITY_DEFICIT");
    expect(findings.map((finding) => finding.ruleId)).not.toContain("LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT");
  });

  test("control variant with prompt replacement does not produce correlated root cause", () => {
    const result = runCriticalHaulerLossScenario(createCriticalHaulerLossScenario({
      runId: "run-control",
      replacementRequestDelayTicks: 1,
      replacementSpawnDelayTicks: 3
    }));
    const metrics = calculateDiagnosticMetrics(result.telemetry, result.config);
    const findings = evaluateDiagnosticRules(result.telemetry, metrics, result.config);

    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT"
    );
  });
});

describe("diagnostic reports", () => {
  test("writes structured JSON and readable Markdown diagnostic reports", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diagnostic-report-"));
    try {
      const scenario = createCriticalHaulerLossScenario({
        runId: "run-report",
        replacementRequestDelayTicks: 38,
        replacementSpawnDelayTicks: 22
      });
      const result = runCriticalHaulerLossScenario(scenario);
      const metrics = calculateDiagnosticMetrics(result.telemetry, result.config);
      const findings = evaluateDiagnosticRules(result.telemetry, metrics, result.config);

      const report = await writeDiagnosticReports({
        outputRoot: dir,
        runId: scenario.runId,
        scenarioId: scenario.scenarioId,
        codeVersion: "test",
        config: result.config,
        outcome: "failed",
        metrics,
        findings,
        events: result.telemetry.events,
        invariantViolations: [],
        artifactReferences: []
      });

      const json = JSON.parse(await readFile(report.jsonPath, "utf8"));
      expect(json.findings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
        "LOGISTICS_SOURCE_BACKPRESSURE"
      );
      expect(await readFile(report.markdownPath, "utf8")).toContain(
        "Critical hauling capacity was not restored quickly enough"
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
