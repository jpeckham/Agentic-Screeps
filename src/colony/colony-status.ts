import type { ColonySnapshot } from "./colony-snapshot.js";
import type { DefenseDecision } from "./defense-coordinator.js";
import type { ColonyMemory } from "./colony-state.js";

export interface AssignmentCounts {
  harvest: number;
  deliver: number;
  upgrade: number;
  build: number;
  repair: number;
}

export interface ColonyStatus {
  roomName: string;
  rcl: number;
  mode: "EMERGENCY" | "NORMAL";
  energy: {
    available: number;
    capacity: number;
  };
  workers: {
    actual: number;
    desired: number;
  };
  strategy: string;
  assignments: AssignmentCounts;
  defense: DefenseDecision;
  threat: ColonySnapshot["threatAssessment"];
  constructionSiteCount: number;
  cpuUsed: number;
}

export function createColonyStatus(options: {
  snapshot: ColonySnapshot;
  memory: ColonyMemory;
  desiredWorkers: number;
  defenseDecision: DefenseDecision;
  cpuUsed: number;
}): ColonyStatus {
  return {
    roomName: options.memory.roomName,
    rcl: options.snapshot.rcl,
    mode: options.memory.emergency ? "EMERGENCY" : "NORMAL",
    energy: {
      available: options.snapshot.energyAvailable,
      capacity: options.snapshot.energyCapacityAvailable
    },
    workers: {
      actual: options.snapshot.workers.length,
      desired: options.desiredWorkers
    },
    strategy: options.memory.strategy ?? "unselected",
    assignments: countAssignments(options.snapshot.workers),
    defense: options.defenseDecision,
    threat: options.snapshot.threatAssessment,
    constructionSiteCount: options.snapshot.constructionSites.length,
    cpuUsed: options.cpuUsed
  };
}

export function formatColonyStatusLog(status: ColonyStatus): string {
  return `[colony ${status.roomName}] status: RCL ${status.rcl} ${status.mode} ` +
    `energy ${status.energy.available}/${status.energy.capacity} ` +
    `workers ${status.workers.actual}/${status.workers.desired} ` +
    `assignments H${status.assignments.harvest} D${status.assignments.deliver} U${status.assignments.upgrade} ` +
    `B${status.assignments.build} R${status.assignments.repair} ` +
    `defense ${status.defense.posture.toUpperCase()} ` +
    `threat ${status.threat.severity.toUpperCase()} hostiles ${status.threat.hostileCount} ` +
    `sites ${status.constructionSiteCount} cpu ${status.cpuUsed.toFixed(1)}`;
}

function countAssignments(workers: ColonySnapshot["workers"]): AssignmentCounts {
  const counts = { harvest: 0, deliver: 0, upgrade: 0, build: 0, repair: 0 };
  for (const worker of workers) {
    const assignment = worker.memory?.["assignment"];
    if (isAssignmentType(assignment, "harvest")) counts.harvest += 1;
    if (isAssignmentType(assignment, "deliver")) counts.deliver += 1;
    if (isAssignmentType(assignment, "upgrade")) counts.upgrade += 1;
    if (isAssignmentType(assignment, "build")) counts.build += 1;
    if (isAssignmentType(assignment, "repair")) counts.repair += 1;
  }
  return counts;
}

function isAssignmentType(value: unknown, type: string): boolean {
  return typeof value === "object" && value !== null && "type" in value && value.type === type;
}
