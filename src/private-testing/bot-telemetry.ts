import type { ColonyMemory } from "../colony/colony-state.js";
import type { ColonySnapshot } from "../colony/colony-snapshot.js";
import { selectTowerAttackIntent } from "../colony/defense-coordinator.js";

export interface PrivateTestingMemory {
  testing?: {
    tick: number;
    colonies: Record<string, PrivateTestingColonyObservation>;
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
