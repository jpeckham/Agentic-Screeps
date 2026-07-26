import type { AnyPosition, ThreatAssessment } from "./colony-snapshot.js";

export type DefensivePosture = "peace" | "alert" | "engage";

export interface DefenseDecision {
  posture: DefensivePosture;
  reason: string;
}

export type TowerAttackIntent =
  | { type: "attack"; targetId: string }
  | { type: "hold" };

export class ColonyDefenseCoordinator {
  decide(threatAssessment: ThreatAssessment): DefenseDecision {
    if (threatAssessment.severity === "none") {
      return { posture: "peace", reason: "threat none" };
    }
    if (threatAssessment.severity === "low") {
      return { posture: "alert", reason: "threat low" };
    }
    return { posture: "engage", reason: `threat ${threatAssessment.severity}` };
  }
}

const coordinator = new ColonyDefenseCoordinator();

export function decideDefensePosture(threatAssessment: ThreatAssessment): DefenseDecision {
  return coordinator.decide(threatAssessment);
}

export function selectTowerAttackIntent(
  posture: DefensivePosture,
  hostiles: unknown[],
  criticalStructures: unknown[]
): TowerAttackIntent {
  if (posture !== "engage") return { type: "hold" };

  const target = hostiles
    .map((hostile) => hostileCandidate(hostile, criticalStructures))
    .filter((candidate): candidate is HostileCandidate => candidate !== undefined)
    .sort(compareHostileCandidates)[0];

  return target ? { type: "attack", targetId: target.id } : { type: "hold" };
}

interface HostileCandidate {
  id: string;
  priority: number;
  distanceToCritical: number;
  damageRatio: number;
}

function hostileCandidate(hostile: unknown, criticalStructures: unknown[]): HostileCandidate | undefined {
  if (typeof hostile !== "object" || hostile === null || !("id" in hostile) || typeof hostile.id !== "string") {
    return undefined;
  }

  return {
    id: hostile.id,
    priority: bodyPriority(hostile),
    distanceToCritical: closestCriticalDistance(hostilePosition(hostile), criticalStructures),
    damageRatio: damageRatio(hostile)
  };
}

function compareHostileCandidates(left: HostileCandidate, right: HostileCandidate): number {
  return left.priority - right.priority ||
    left.distanceToCritical - right.distanceToCritical ||
    left.damageRatio - right.damageRatio ||
    left.id.localeCompare(right.id);
}

function bodyPriority(hostile: unknown): number {
  const parts = liveBodyParts(hostile);
  if (parts.some((part) => part.type === "heal")) return 0;
  if (parts.some((part) => part.type === "ranged_attack")) return 1;
  if (parts.some((part) => part.type === "attack")) return 2;
  if (parts.some((part) => part.type === "work")) return 3;
  return 4;
}

function liveBodyParts(hostile: unknown): Array<{ type: string; hits?: number }> {
  if (typeof hostile !== "object" || hostile === null || !("body" in hostile) || !Array.isArray(hostile.body)) {
    return [];
  }
  return hostile.body.filter((part): part is { type: string; hits?: number } =>
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    typeof part.type === "string" &&
    (!("hits" in part) || typeof part.hits === "number") &&
    ((part.hits ?? 1) > 0)
  );
}

function closestCriticalDistance(pos: AnyPosition | undefined, criticalStructures: unknown[]): number {
  if (!pos) return Number.POSITIVE_INFINITY;

  const distances = criticalStructures
    .map((structure) => rangeTo(pos, hostilePosition(structure)))
    .filter((distance) => Number.isFinite(distance));
  return distances.length > 0 ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

function rangeTo(left: AnyPosition, right: AnyPosition | undefined): number {
  if (!right) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function hostilePosition(value: unknown): AnyPosition | undefined {
  if (typeof value !== "object" || value === null || !("pos" in value)) return undefined;
  const pos = value.pos;
  if (typeof pos !== "object" || pos === null || !("x" in pos) || !("y" in pos)) return undefined;
  if (typeof pos.x !== "number" || typeof pos.y !== "number") return undefined;
  return pos as AnyPosition;
}

function damageRatio(hostile: unknown): number {
  if (typeof hostile !== "object" || hostile === null || !("hits" in hostile) || !("hitsMax" in hostile)) {
    return 1;
  }
  if (typeof hostile.hits !== "number" || typeof hostile.hitsMax !== "number" || hostile.hitsMax <= 0) {
    return 1;
  }
  return hostile.hits / hostile.hitsMax;
}
