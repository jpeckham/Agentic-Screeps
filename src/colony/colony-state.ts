export type WorkType = "harvest" | "deliver" | "build" | "upgrade" | "repair";
export type WorkerRole = "worker" | "emergency-worker";
export type WorkerMode = "acquire" | "work";

export interface WorkAssignment {
  type: WorkType;
  targetId?: string;
  sourceId?: string;
}

export interface ColonyCreepMemory {
  colony: string;
  role: WorkerRole;
  mode: WorkerMode;
  assignment?: WorkAssignment;
  replacing?: string;
}

export interface ColonyMemory {
  roomName: string;
  initializedAt: number;
  lastKnownRcl: number;
  emergency: boolean;
  lastEmergencyReason?: string;
  lastPlanTick: number;
  forceReplan?: boolean;
  workforceTarget: number;
  lastStatusLog?: number;
  lastConstructionPlan?: {
    tick: number;
    rcl: number;
    structureType: string;
    x: number;
    y: number;
  };
}

export interface ColonyRootMemory {
  colonies?: Record<string, ColonyMemory>;
  config?: {
    visualsEnabled?: boolean;
  };
  creeps?: Record<string, ColonyCreepMemory | Record<string, unknown>>;
}

export function createInitialColonyMemory(
  roomName: string,
  rcl: number,
  tick: number
): ColonyMemory {
  return {
    roomName,
    initializedAt: tick,
    lastKnownRcl: rcl,
    emergency: false,
    lastPlanTick: 0,
    workforceTarget: 0
  };
}

export function ensureColonyMemory(
  memory: ColonyRootMemory,
  roomName: string,
  rcl: number,
  tick: number
): ColonyMemory {
  memory.colonies ??= {};
  memory.colonies[roomName] ??= createInitialColonyMemory(roomName, rcl, tick);
  return memory.colonies[roomName];
}
