export type WorkType = "harvest" | "deliver" | "build" | "upgrade" | "repair";
export type WorkerRole = "worker" | "emergency-worker";
export type WorkerMode = "acquire" | "work";
export type DefensivePosture = "peace" | "alert" | "engage";

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

export interface ColonyDefenseMemory {
  posture: DefensivePosture;
  enteredAt: number;
  pendingPosture?: DefensivePosture;
  pendingSince?: number;
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
  strategy?: string;
  defense?: ColonyDefenseMemory;
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
    privateTestingEnabled?: boolean;
    diagnostics?: DiagnosticScenarioMemory;
  };
  creeps?: Record<string, ColonyCreepMemory | Record<string, unknown>>;
  testing?: {
    tick: number;
    colonies: Record<string, {
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
    }>;
    diagnostics?: PrivateTestingDiagnosticMemory;
  };
}

export interface DiagnosticScenarioMemory {
  scenarioId: "critical-hauler-loss";
  runId: string;
  reportScenarioId?: string;
  startedAtTick: number;
  roomName?: string;
  stableBaselineOffsetTicks?: number;
  haulerLossOffsetTicks?: number;
  replacementRequestDelayTicks: number;
  replacementSpawnDelayTicks: number;
}

export interface PrivateTestingDiagnosticMemory {
  events: Array<{
    runId: string;
    scenarioId: string;
    gameTick: number;
    roomName?: string;
    subsystem: string;
    eventType: string;
    entityId?: string;
    measurements?: Record<string, number>;
    context?: Record<string, string | number | boolean>;
    codeVersion?: string;
  }>;
  metrics: Array<{
    runId: string;
    scenarioId: string;
    gameTick: number;
    roomName?: string;
    metricName: string;
    value: number;
    unit?: string;
    dimensions?: Record<string, string>;
  }>;
  emittedEventKeys?: string[];
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
