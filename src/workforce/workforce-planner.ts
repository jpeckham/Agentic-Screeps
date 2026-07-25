import { buildWorkerBody } from "./body-builder.js";

export interface WorkforceInput {
  roomName: string;
  rcl: number;
  sourceCount: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  workerCount: number;
  replacementCount: number;
  expiringWorkerCount: number;
  constructionSiteCount: number;
}

export interface SpawnRequest {
  role: "worker" | "emergency-worker";
  body: string[];
  replacing?: string;
}

export interface WorkforcePlan {
  desiredWorkers: number;
  emergency: boolean;
  spawnRequest?: SpawnRequest;
}

const BODY_CONSTANTS = { WORK: "work", CARRY: "carry", MOVE: "move" };

export function planWorkforce(input: WorkforceInput): WorkforcePlan {
  const emergency = input.workerCount === 0 || input.expiringWorkerCount >= input.workerCount;
  const desiredWorkers = desiredWorkerCount(input);

  if (emergency) {
    const body = input.energyAvailable >= 200
      ? [BODY_CONSTANTS.WORK, BODY_CONSTANTS.CARRY, BODY_CONSTANTS.MOVE]
      : buildWorkerBody(input.energyAvailable, input.energyCapacityAvailable, BODY_CONSTANTS);
    return {
      desiredWorkers,
      emergency: true,
      ...(body.length > 0 ? { spawnRequest: { role: "emergency-worker", body } } : {})
    };
  }

  const effectiveWorkers = input.workerCount + input.replacementCount;
  if (effectiveWorkers < desiredWorkers || input.expiringWorkerCount > input.replacementCount) {
    const body = buildWorkerBody(input.energyAvailable, input.energyCapacityAvailable, BODY_CONSTANTS);
    if (body.length > 0) {
      return { desiredWorkers, emergency: false, spawnRequest: { role: "worker", body } };
    }
  }

  return { desiredWorkers, emergency: false };
}

function desiredWorkerCount(input: WorkforceInput): number {
  const baseByRcl = input.rcl <= 1 ? 3 : input.rcl === 2 ? 4 : input.rcl === 3 ? 5 : 6;
  const sourceDemand = Math.max(2, input.sourceCount * 2);
  const constructionBonus = input.constructionSiteCount >= 4 ? 1 : 0;
  return Math.min(6, Math.max(baseByRcl, sourceDemand) + constructionBonus);
}
