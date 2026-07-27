import { DEFAULT_DIAGNOSTIC_CONFIG, mergeDiagnosticConfig, type DiagnosticConfig } from "../diagnostics/config.js";
import { SimulationDiagnosticRecorder, type DiagnosticTelemetry } from "../diagnostics/telemetry.js";

export interface CriticalHaulerLossScenarioOptions {
  runId: string;
  roomName?: string;
  replacementRequestDelayTicks: number;
  replacementSpawnDelayTicks: number;
  degradedTicksOverride?: number;
  config?: Partial<DiagnosticConfig>;
}

export interface CriticalHaulerLossScenario {
  scenarioId: "critical-hauler-loss";
  runId: string;
  roomName: string;
  stableBaselineTick: number;
  haulerLossTick: number;
  replacementRequestDelayTicks: number;
  replacementSpawnDelayTicks: number;
  degradedTicks: number;
  config: DiagnosticConfig;
}

export interface CriticalHaulerLossResult {
  telemetry: DiagnosticTelemetry;
  config: DiagnosticConfig;
}

export function createCriticalHaulerLossScenario(
  options: CriticalHaulerLossScenarioOptions
): CriticalHaulerLossScenario {
  const config = mergeDiagnosticConfig(options.config);
  const degradedTicks = options.degradedTicksOverride
    ?? Math.max(0, options.replacementRequestDelayTicks + options.replacementSpawnDelayTicks + 18);
  return {
    scenarioId: "critical-hauler-loss",
    runId: options.runId,
    roomName: options.roomName ?? "W1N1",
    stableBaselineTick: 100,
    haulerLossTick: 200,
    replacementRequestDelayTicks: options.replacementRequestDelayTicks,
    replacementSpawnDelayTicks: options.replacementSpawnDelayTicks,
    degradedTicks,
    config
  };
}

export function runCriticalHaulerLossScenario(
  scenario: CriticalHaulerLossScenario
): CriticalHaulerLossResult {
  const recorder = new SimulationDiagnosticRecorder();
  const startTick = scenario.stableBaselineTick;
  const endTick = Math.min(
    scenario.haulerLossTick + scenario.degradedTicks + scenario.config.recoveryStabilityTicks,
    scenario.stableBaselineTick + scenario.config.scenarioMaximumTicks
  );
  const lossTick = scenario.haulerLossTick;
  const requestTick = lossTick + scenario.replacementRequestDelayTicks;
  const spawnStartTick = requestTick + scenario.replacementSpawnDelayTicks;
  const spawnedTick = lossTick + scenario.degradedTicks;
  const backpressureStart = lossTick + 15;
  const backpressureEnd = spawnedTick + 3;

  recordEvent("logistics", "baseline_established", scenario.stableBaselineTick);
  recordEvent("logistics", "hauler_lost", lossTick, "hauler-critical-1", { carryParts: 6 });
  recordEvent("spawn", "hauler_replacement_requested", requestTick, "replacement-hauler-1", undefined, {
    priority: 80,
    queuedAhead: scenario.replacementSpawnDelayTicks > DEFAULT_DIAGNOSTIC_CONFIG.criticalReplacementSpawnToleranceTicks ? 2 : 0
  });
  recordEvent("spawn", "hauler_replacement_started", spawnStartTick, "replacement-hauler-1");
  recordEvent("spawn", "hauler_replacement_spawned", spawnedTick, "replacement-hauler-1");
  if (scenario.degradedTicks > scenario.config.sourceBackpressureDurationTicks + 15) {
    recordEvent("source", "source_backpressure_started", backpressureStart);
    recordEvent("source", "miner_harvest_blocked", backpressureStart + 6, "miner-source-1", { blockedTicks: 1 });
    recordEvent("source", "source_backpressure_ended", backpressureEnd);
  }

  for (let tick = startTick; tick <= endTick; tick += 1) {
    const degraded = tick >= lossTick && tick < spawnedTick;
    const recovered = tick >= backpressureEnd;
    const activeCapacity = degraded ? 6 : 12;
    const fullness = sourceFullness(tick, scenario, backpressureStart, backpressureEnd);
    const blockedHarvestTicks = fullness > 0.95 ? 1 : 0;
    const delivered = degraded ? 6 : recovered ? 13 : 12;

    metric(tick, "logistics.activeHaulingCapacity", activeCapacity, "carry-parts");
    metric(tick, "logistics.requiredHaulingCapacity", 12, "carry-parts");
    metric(tick, "logistics.energyDelivered", delivered, "energy");
    metric(tick, "logistics.haulerIdleTicks", degraded ? 0 : 1, "ticks");
    metric(tick, "logistics.haulerEmptyTravelTicks", degraded ? 4 : 2, "ticks");
    metric(tick, "logistics.replacementGapTicks", degraded ? tick - lossTick : 0, "ticks");
    metric(tick, "source.containerFullness", fullness, "ratio", { sourceId: "source-1" });
    metric(tick, "source.blockedHarvestTicks", blockedHarvestTicks, "ticks");
    metric(tick, "spawn.queueLength", degraded ? 3 : 1, "requests");
    metric(tick, "spawn.haulerRequestPriority", tick >= requestTick && tick < spawnStartTick ? 80 : 0, "priority");
    metric(tick, "spawn.haulerRequestWaitTicks", tick >= requestTick && tick < spawnStartTick ? tick - requestTick : 0, "ticks");
    metric(tick, "room.energyAvailable", degraded ? 180 : 300, "energy");
    metric(tick, "room.energyCapacityAvailable", 550, "energy");
    metric(tick, "cpu.total", 4.2, "cpu");
    metric(tick, "cpu.logistics", 0.7, "cpu");
    if (tick % 10 === 0) recordEvent("logistics", "delivery_completed", tick, "hauler-active", { energy: delivered });
  }

  return { telemetry: recorder.flush(), config: scenario.config };

  function metric(
    gameTick: number,
    metricName: string,
    value: number,
    unit?: string,
    dimensions?: Record<string, string>
  ): void {
    recorder.recordMetric({
      runId: scenario.runId,
      scenarioId: scenario.scenarioId,
      gameTick,
      roomName: scenario.roomName,
      metricName,
      value,
      ...(unit ? { unit } : {}),
      ...(dimensions ? { dimensions } : {})
    });
  }

  function recordEvent(
    subsystem: string,
    eventType: string,
    gameTick: number,
    entityId?: string,
    measurements?: Record<string, number>,
    context?: Record<string, string | number | boolean>
  ): void {
    recorder.recordEvent({
      runId: scenario.runId,
      scenarioId: scenario.scenarioId,
      gameTick,
      roomName: scenario.roomName,
      subsystem,
      eventType,
      ...(entityId ? { entityId } : {}),
      ...(measurements ? { measurements } : {}),
      ...(context ? { context } : {})
    });
  }
}

function sourceFullness(
  tick: number,
  scenario: CriticalHaulerLossScenario,
  backpressureStart: number,
  backpressureEnd: number
): number {
  if (tick < scenario.haulerLossTick) return 0.35;
  if (scenario.degradedTicks <= scenario.config.sourceBackpressureDurationTicks + 15) return 0.55;
  if (tick < backpressureStart) return 0.6 + (tick - scenario.haulerLossTick) * 0.01;
  if (tick < backpressureEnd) return Math.min(0.98, 0.84 + (tick - backpressureStart) * 0.01);
  return 0.45;
}
