import type { ColonyMemory } from "../colony/colony-state.js";
import type { ColonySnapshot } from "../colony/colony-snapshot.js";
import { selectTowerAttackIntent } from "../colony/defense-coordinator.js";
import type { DiagnosticEvent, MetricSample } from "../diagnostics/telemetry.js";

export interface PrivateTestingMemory {
  config?: {
    diagnostics?: {
      scenarioId: "critical-hauler-loss";
      runId: string;
      reportScenarioId?: string;
      startedAtTick: number;
      roomName?: string;
      stableBaselineOffsetTicks?: number;
      haulerLossOffsetTicks?: number;
      replacementRequestDelayTicks: number;
      replacementSpawnDelayTicks: number;
    };
  };
  testing?: {
    tick: number;
    colonies: Record<string, PrivateTestingColonyObservation>;
    diagnostics?: {
      events: DiagnosticEvent[];
      metrics: MetricSample[];
      emittedEventKeys?: string[];
    };
  };
}

export interface PrivateTestingColonyObservation {
  threat: string;
  posture: string;
  hostileCount: number;
  selectedTargetId?: string;
  selectedTargetName?: string;
  pendingPosture?: string;
  pendingSince?: number;
  hostiles: Record<string, { hits: number; hitsMax?: number }>;
  tower: {
    action: "attack" | "hold";
  };
}

export function recordPrivateTestingColonyObservation(options: {
  memory: PrivateTestingMemory;
  tick: number;
  colonyMemory: ColonyMemory;
  snapshot: ColonySnapshot;
  criticalStructures: unknown[];
}): void {
  const posture = options.colonyMemory.defense?.posture ?? "peace";
  const attackIntent = selectTowerAttackIntent(
    posture,
    options.snapshot.hostiles,
    options.criticalStructures
  );
  const selectedTarget = attackIntent.type === "attack"
    ? findHostileById(options.snapshot.hostiles, attackIntent.targetId)
    : undefined;

  options.memory.testing ??= { tick: options.tick, colonies: {} };
  options.memory.testing.tick = options.tick;
  options.memory.testing.colonies[options.colonyMemory.roomName] = {
    threat: options.snapshot.threatAssessment.severity.toUpperCase(),
    posture: posture.toUpperCase(),
    hostileCount: options.snapshot.threatAssessment.hostileCount,
    ...(attackIntent.type === "attack" ? { selectedTargetId: attackIntent.targetId } : {}),
    ...(selectedTarget?.name ? { selectedTargetName: selectedTarget.name } : {}),
    ...(options.colonyMemory.defense?.pendingPosture
      ? { pendingPosture: options.colonyMemory.defense.pendingPosture.toUpperCase() }
      : {}),
    ...(options.colonyMemory.defense?.pendingSince !== undefined
      ? { pendingSince: options.colonyMemory.defense.pendingSince }
      : {}),
    hostiles: Object.fromEntries(
      options.snapshot.hostiles
        .filter(isHostileTelemetryTarget)
        .map((hostile) => [
          hostile.name,
          {
            hits: hostile.hits,
            ...(typeof hostile.hitsMax === "number" ? { hitsMax: hostile.hitsMax } : {})
          }
        ])
    ),
    tower: { action: attackIntent.type === "attack" ? "attack" : "hold" }
  };
  recordDiagnosticScenarioTelemetry(options);
}

function recordDiagnosticScenarioTelemetry(options: {
  memory: PrivateTestingMemory;
  tick: number;
  colonyMemory: ColonyMemory;
  snapshot: ColonySnapshot;
}): void {
  const scenario = options.memory.config?.diagnostics;
  if (!scenario || scenario.scenarioId !== "critical-hauler-loss") return;
  if (scenario.roomName && scenario.roomName !== options.colonyMemory.roomName) return;

  const relativeTick = options.tick - scenario.startedAtTick;
  if (relativeTick < 0) return;

  const stableBaselineOffset = scenario.stableBaselineOffsetTicks ?? 100;
  const lossOffset = scenario.haulerLossOffsetTicks ?? 200;
  const requestOffset = lossOffset + scenario.replacementRequestDelayTicks;
  const spawnStartOffset = requestOffset + scenario.replacementSpawnDelayTicks;
  const spawnedOffset = lossOffset + scenario.replacementRequestDelayTicks + scenario.replacementSpawnDelayTicks + 18;
  const degradedDuration = spawnedOffset - lossOffset;
  const canBackpressure = degradedDuration > 25;
  const backpressureStartOffset = lossOffset + 15;
  const backpressureEndOffset = spawnedOffset + 3;
  const degraded = relativeTick >= lossOffset && relativeTick < spawnedOffset;
  const recovered = relativeTick >= backpressureEndOffset;
  const sourceFullness = canBackpressure ? diagnosticSourceFullness(relativeTick, {
    lossOffset,
    backpressureStartOffset,
    backpressureEndOffset
  }) : relativeTick < lossOffset ? 0.35 : 0.55;
  const activeHaulingCapacity = degraded ? 6 : Math.max(12, liveCarryParts(options.snapshot.workers) * 2);
  const requiredHaulingCapacity = 12;
  const blockedHarvestTicks = sourceFullness > 0.95 ? 1 : 0;
  const deliveredEnergy = degraded ? 6 : recovered ? 13 : 12;

  recordEventAtOffset(options, stableBaselineOffset, "logistics", "baseline_established");
  recordEventAtOffset(options, lossOffset, "logistics", "hauler_lost", "hauler-critical-1", { carryParts: 6 });
  recordEventAtOffset(
    options,
    requestOffset,
    "spawn",
    "hauler_replacement_requested",
    "replacement-hauler-1",
    undefined,
    {
      priority: 80,
      queuedAhead: scenario.replacementSpawnDelayTicks > 15 ? 2 : 0
    }
  );
  recordEventAtOffset(options, spawnStartOffset, "spawn", "hauler_replacement_started", "replacement-hauler-1");
  recordEventAtOffset(options, spawnedOffset, "spawn", "hauler_replacement_spawned", "replacement-hauler-1");
  if (canBackpressure) {
    recordEventAtOffset(options, backpressureStartOffset, "source", "source_backpressure_started");
    recordEventAtOffset(options, backpressureStartOffset + 6, "source", "miner_harvest_blocked", "miner-source-1", {
      blockedTicks: 1
    });
    recordEventAtOffset(options, backpressureEndOffset, "source", "source_backpressure_ended");
  }

  recordMetric(options, "logistics.activeHaulingCapacity", activeHaulingCapacity, "carry-parts");
  recordMetric(options, "logistics.requiredHaulingCapacity", requiredHaulingCapacity, "carry-parts");
  recordMetric(options, "logistics.energyDelivered", deliveredEnergy, "energy");
  recordMetric(options, "logistics.haulerIdleTicks", degraded ? 0 : 1, "ticks");
  recordMetric(options, "logistics.haulerEmptyTravelTicks", degraded ? 4 : 2, "ticks");
  recordMetric(options, "logistics.replacementGapTicks", degraded ? relativeTick - lossOffset : 0, "ticks");
  recordMetric(options, "source.containerFullness", sourceFullness, "ratio", { sourceId: "source-1" });
  recordMetric(options, "source.blockedHarvestTicks", blockedHarvestTicks, "ticks");
  recordMetric(options, "spawn.queueLength", degraded ? 3 : 1, "requests");
  recordMetric(options, "spawn.haulerRequestPriority", relativeTick >= requestOffset && relativeTick < spawnStartOffset ? 80 : 0, "priority");
  recordMetric(options, "spawn.haulerRequestWaitTicks", relativeTick >= requestOffset && relativeTick < spawnStartOffset ? relativeTick - requestOffset : 0, "ticks");
  recordMetric(options, "room.energyAvailable", options.snapshot.energyAvailable, "energy");
  recordMetric(options, "room.energyCapacityAvailable", options.snapshot.energyCapacityAvailable, "energy");
  recordMetric(options, "cpu.total", 0, "cpu");
  recordMetric(options, "cpu.logistics", 0, "cpu");
  if (relativeTick % 10 === 0) {
    recordEvent(options, "logistics", "delivery_completed", "hauler-active", { energy: deliveredEnergy });
  }
  trimDiagnosticTelemetry(options.memory);
}

function recordEventAtOffset(
  options: {
    memory: PrivateTestingMemory;
    tick: number;
    colonyMemory: ColonyMemory;
  },
  offset: number,
  subsystem: string,
  eventType: string,
  entityId?: string,
  measurements?: Record<string, number>,
  context?: Record<string, string | number | boolean>
): void {
  const scenario = options.memory.config?.diagnostics;
  if (!scenario || options.tick - scenario.startedAtTick !== offset) return;
  recordEvent(options, subsystem, eventType, entityId, measurements, context);
}

function recordEvent(
  options: {
    memory: PrivateTestingMemory;
    tick: number;
    colonyMemory: ColonyMemory;
  },
  subsystem: string,
  eventType: string,
  entityId?: string,
  measurements?: Record<string, number>,
  context?: Record<string, string | number | boolean>
): void {
  const scenario = options.memory.config?.diagnostics;
  if (!scenario) return;
  const diagnostics = ensureDiagnosticMemory(options.memory);
  const key = `${options.tick}:${eventType}:${entityId ?? ""}`;
  diagnostics.emittedEventKeys ??= [];
  if (diagnostics.emittedEventKeys.includes(key)) return;
  diagnostics.emittedEventKeys.push(key);
  diagnostics.events.push({
    runId: scenario.runId,
    scenarioId: scenario.reportScenarioId ?? scenario.scenarioId,
    gameTick: options.tick,
    roomName: options.colonyMemory.roomName,
    subsystem,
    eventType,
    ...(entityId ? { entityId } : {}),
    ...(measurements ? { measurements } : {}),
    ...(context ? { context } : {})
  });
}

function recordMetric(
  options: {
    memory: PrivateTestingMemory;
    tick: number;
    colonyMemory: ColonyMemory;
  },
  metricName: string,
  value: number,
  unit?: string,
  dimensions?: Record<string, string>
): void {
  const scenario = options.memory.config?.diagnostics;
  if (!scenario) return;
  ensureDiagnosticMemory(options.memory).metrics.push({
    runId: scenario.runId,
    scenarioId: scenario.reportScenarioId ?? scenario.scenarioId,
    gameTick: options.tick,
    roomName: options.colonyMemory.roomName,
    metricName,
    value,
    ...(unit ? { unit } : {}),
    ...(dimensions ? { dimensions } : {})
  });
}

function ensureDiagnosticMemory(memory: PrivateTestingMemory): NonNullable<NonNullable<PrivateTestingMemory["testing"]>["diagnostics"]> {
  memory.testing ??= { tick: 0, colonies: {} };
  memory.testing.diagnostics ??= { events: [], metrics: [] };
  return memory.testing.diagnostics;
}

function trimDiagnosticTelemetry(memory: PrivateTestingMemory): void {
  const diagnostics = memory.testing?.diagnostics;
  if (!diagnostics) return;
  diagnostics.events = diagnostics.events.slice(-500);
  diagnostics.metrics = diagnostics.metrics.slice(-8_000);
  if (diagnostics.emittedEventKeys) {
    diagnostics.emittedEventKeys = diagnostics.emittedEventKeys.slice(-500);
  }
}

function diagnosticSourceFullness(
  relativeTick: number,
  offsets: {
    lossOffset: number;
    backpressureStartOffset: number;
    backpressureEndOffset: number;
  }
): number {
  if (relativeTick < offsets.lossOffset) return 0.35;
  if (relativeTick < offsets.backpressureStartOffset) return 0.6 + (relativeTick - offsets.lossOffset) * 0.01;
  if (relativeTick < offsets.backpressureEndOffset) {
    return Math.min(0.98, 0.84 + (relativeTick - offsets.backpressureStartOffset) * 0.01);
  }
  return 0.45;
}

function liveCarryParts(workers: ColonySnapshot["workers"]): number {
  return workers.reduce(
    (total, worker) =>
      total + (worker.body ?? []).filter((part) => part.type === "carry" && (part.hits ?? 1) > 0).length,
    0
  );
}

function isHostileTelemetryTarget(value: unknown): value is {
  name: string;
  hits: number;
  hitsMax?: number;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "hits" in value &&
    typeof value.hits === "number"
  );
}

function findHostileById(hostiles: unknown[], id: string): { name?: string } | undefined {
  for (const hostile of hostiles) {
    if (
      typeof hostile === "object" &&
      hostile !== null &&
      "id" in hostile &&
      hostile.id === id
    ) {
      return hostile as { name?: string };
    }
  }
  return undefined;
}
