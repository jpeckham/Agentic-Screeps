import { mergeColonyConfig, type ColonyConfig } from "./config.js";
import {
  createColonySnapshot,
  type AnyRoom,
  type SnapshotConstants
} from "./colony-snapshot.js";
import {
  ensureColonyMemory,
  type ColonyMemory,
  type ColonyRootMemory
} from "./colony-state.js";
import { planWorkforce } from "../workforce/workforce-planner.js";
import { runWorker } from "../creeps/creep-runner.js";
import { planConstruction, removeSourceBlockingConstruction } from "../construction/construction-planner.js";
import { runTower } from "../structures/tower-controller.js";
import type { TowerLike } from "../structures/tower-controller.js";
import { drawRoomStatusVisual } from "../visualization/room-status-visual.js";
import { selectColonyStrategy } from "./strategy.js";

export interface ColonyGame {
  time: number;
  rooms: Record<string, AnyRoom>;
  creeps: Record<string, unknown>;
}

export interface ColonyRunOptions {
  game: ColonyGame;
  memory: ColonyRootMemory | ColonyMemory;
  constants: SnapshotConstants & {
    WORK: string;
    CARRY: string;
    MOVE: string;
    OK: number;
    ERR_NOT_IN_RANGE: number;
  };
  log: (message: string) => void;
  cpu: { getUsed(): number; bucket?: number };
  config?: Partial<ColonyConfig>;
  snapshot?: ReturnType<typeof createColonySnapshot>;
}

export function runOwnedColonies(options: Omit<ColonyRunOptions, "memory"> & {
  memory: ColonyRootMemory;
}): void {
  for (const room of Object.values(options.game.rooms)) {
    if (room.controller?.my) {
      const snapshot = createColonySnapshot(room, options.constants);
      const colonyMemory = ensureColonyMemory(options.memory, room.name, snapshot.rcl, options.game.time);
      const config = options.config ?? options.memory.config;
      runColony({ ...options, memory: colonyMemory, snapshot, ...(config ? { config } : {}) });
    }
  }
}

export function runColony(options: ColonyRunOptions): void {
  const config = mergeColonyConfig(options.config);
  const roomName = "roomName" in options.memory ? options.memory.roomName : firstOwnedRoomName(options.game);
  const room = options.game.rooms[roomName];
  if (!room) return;

  const snapshot = options.snapshot ?? createColonySnapshot(room, options.constants);
  const memory = "roomName" in options.memory
    ? options.memory
    : ensureColonyMemory(options.memory, room.name, snapshot.rcl, options.game.time);
  const cpuStart = options.cpu.getUsed();

  logLifecycle(memory, snapshot.rcl, options.game.time, options.log);
  const strategy = selectColonyStrategy(snapshot, {
    controllerEmergencyThreshold: config.controllerEmergencyThreshold,
    towerEnergyReserve: config.towerEnergyReserve
  });
  updateStrategy(memory, strategy.name, options.log);
  runTowers(snapshot, options.constants, config, strategy.worker.towerEnergyReserve);

  const viableWorkers = snapshot.workers.filter((creep) =>
    hasWorkAndCarry(creep) && (creep.ticksToLive ?? 1500) > config.emergencyTtlThreshold
  );
  const expiringWorkers = snapshot.workers.filter((creep) =>
    hasWorkAndCarry(creep) && (creep.ticksToLive ?? 1500) <= config.replacementTtlThreshold
  );
  const expiringWorkerNames = new Set(expiringWorkers.map((creep) => creep.name));
  const replacingNames = new Set(
    snapshot.workers
      .map((creep) => creep.memory?.["replacing"])
      .filter((name): name is string => typeof name === "string" && expiringWorkerNames.has(name))
  );
  const replacementCount = replacingNames.size;
  const replacementTarget = expiringWorkers.find((creep) => !replacingNames.has(creep.name));
  const plan = planWorkforce({
    roomName: room.name,
    rcl: snapshot.rcl,
    sourceCount: snapshot.sources.length,
    energyAvailable: snapshot.energyAvailable,
    energyCapacityAvailable: snapshot.energyCapacityAvailable,
    workerCount: viableWorkers.length,
    replacementCount,
    expiringWorkerCount: expiringWorkers.length,
    constructionSiteCount: snapshot.constructionSites.length,
    strategy: strategy.workforce
  });
  updateWorkforceTarget(memory, plan.desiredWorkers, options.log);
  updateEmergencyState(memory, plan.emergency, viableWorkers.length === 0 ? "no viable workers" : "critical workers expiring", options.log);

  const spawnRequest = plan.spawnRequest && plan.spawnRequest.role === "worker" && replacementTarget
    ? { ...plan.spawnRequest, replacing: replacementTarget.name }
    : plan.spawnRequest;
  spawnFromPlan(snapshot, memory, spawnRequest, options);
  maybeLogStatus({
    snapshot,
    memory,
    desiredWorkers: plan.desiredWorkers,
    tick: options.game.time,
    interval: config.statusLogInterval,
    cpuUsed: options.cpu.getUsed() - cpuStart,
    log: options.log,
    cpuBucket: options.cpu.bucket ?? 10000,
    lowCpuBucket: config.lowCpuBucket
  });

  for (const creep of snapshot.workers) {
    try {
      runWorker(creep, snapshot, options.constants, {
        controllerEmergencyThreshold: config.controllerEmergencyThreshold,
        repairThreshold: config.repairThreshold,
        roadRepairThreshold: config.roadRepairThreshold,
        wallStarterThreshold: config.wallStarterThreshold,
        towerEnergyReserve: strategy.worker.towerEnergyReserve,
        maxExtensionBuilders: strategy.worker.maxExtensionBuilders,
        maxTowerBuilders: strategy.worker.maxTowerBuilders
      });
    } catch (error) {
      options.log(`[colony ${memory.roomName}] creep ${creep.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!memory.emergency && (options.cpu.bucket ?? 10000) >= config.lowCpuBucket) {
    const removedBlockingSites = removeSourceBlockingConstruction(snapshot, options.constants);
    if (removedBlockingSites > 0) {
      memory.forceReplan = true;
      options.log(`[colony ${memory.roomName}] removed ${removedBlockingSites} source-blocking construction site(s)`);
    } else {
      const construction = planConstruction(
        snapshot,
        memory,
        options.constants,
        options.game.time,
        config.planningCadence,
        strategy.construction
      );
      if (construction && typeof room["createConstructionSite" as keyof AnyRoom] === "function") {
        const result = (room as AnyRoom & { createConstructionSite(x: number, y: number, type: string): number })
          .createConstructionSite(construction.x, construction.y, construction.structureType);
        if (result === options.constants.OK) {
          memory.lastConstructionPlan = { tick: options.game.time, rcl: snapshot.rcl, ...construction };
          logConstructionPlanUpdated(snapshot, construction.structureType, options.constants, options.log);
        }
      }
    }
  }

  const visualsEnabled = ("config" in options.memory ? options.memory.config?.visualsEnabled : undefined) ?? config.visualsEnabled;
  if (visualsEnabled && (options.cpu.bucket ?? 10000) >= config.lowCpuBucket) {
    try {
      drawRoomStatusVisual({
        snapshot,
        memory,
        workers: snapshot.workers.length,
        desiredWorkers: plan.desiredWorkers,
        cpuUsed: options.cpu.getUsed() - cpuStart
      });
    } catch (error) {
      options.log(`[colony ${memory.roomName}] visual telemetry failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function firstOwnedRoomName(game: ColonyGame): string {
  return Object.values(game.rooms).find((room) => room.controller?.my)?.name ?? "";
}

function logLifecycle(
  memory: ColonyMemory,
  rcl: number,
  tick: number,
  log: (message: string) => void
): void {
  if (memory.initializedAt === tick) {
    log(`[colony ${memory.roomName}] initialized at RCL ${rcl}`);
  }
  if (memory.lastKnownRcl !== rcl) {
    log(`[colony ${memory.roomName}] reached RCL ${rcl}`);
    memory.lastKnownRcl = rcl;
    memory.forceReplan = true;
  }
}

function runTowers(
  snapshot: ReturnType<typeof createColonySnapshot>,
  constants: SnapshotConstants,
  config: ColonyConfig,
  towerEnergyReserve = config.towerEnergyReserve
): void {
  const repairTargets = snapshot.damagedStructures.filter((structure) =>
    structure.structureType !== "constructedWall" && structure.structureType !== "rampart"
  );
  for (const tower of snapshot.towers) {
    if (tower.attack && tower.heal && tower.repair) {
      runTower({
        tower: tower as TowerLike,
        hostiles: snapshot.hostiles,
        injuredFriendlies: snapshot.injuredFriendlies,
        repairTargets,
        constants,
        reserve: towerEnergyReserve
      });
    }
  }
}

function updateStrategy(
  memory: ColonyMemory,
  strategyName: string,
  log: (message: string) => void
): void {
  if (memory.strategy !== strategyName) {
    memory.strategy = strategyName;
    log(`[colony ${memory.roomName}] strategy selected: ${strategyName}`);
  }
}

function spawnFromPlan(
  snapshot: ReturnType<typeof createColonySnapshot>,
  memory: ColonyMemory,
  spawnRequest: ReturnType<typeof planWorkforce>["spawnRequest"],
  options: ColonyRunOptions
): void {
  if (!spawnRequest) return;
  const spawn = snapshot.spawns.find((item) => !item.spawning && item.spawnCreep);
  if (!spawn?.spawnCreep) return;
  const name = `${spawnRequest.role}-${options.game.time}`;
  const result = spawn.spawnCreep(spawnRequest.body, name, {
    memory: {
      colony: memory.roomName,
      role: spawnRequest.role,
      mode: "acquire",
      ...(spawnRequest.replacing ? { replacing: spawnRequest.replacing } : {})
    }
  });
  if (result === options.constants.OK) {
    options.log(`[colony ${memory.roomName}] spawning ${name} [${spawnRequest.body.join(",").toUpperCase()}]`);
  }
}

function updateEmergencyState(
  memory: ColonyMemory,
  emergency: boolean,
  reason: string,
  log: (message: string) => void
): void {
  if (emergency && !memory.emergency) {
    memory.emergency = true;
    memory.lastEmergencyReason = reason;
    log(`[colony ${memory.roomName}] emergency mode entered: ${reason}`);
  } else if (!emergency && memory.emergency) {
    memory.emergency = false;
    delete memory.lastEmergencyReason;
    log(`[colony ${memory.roomName}] emergency mode cleared`);
  }
}

function updateWorkforceTarget(
  memory: ColonyMemory,
  desiredWorkers: number,
  log: (message: string) => void
): void {
  const previousTarget = memory.workforceTarget;
  if (previousTarget > 0 && previousTarget !== desiredWorkers) {
    log(`[colony ${memory.roomName}] workforce target changed: ${previousTarget} -> ${desiredWorkers}`);
  }
  memory.workforceTarget = desiredWorkers;
}

function maybeLogStatus(options: {
  snapshot: ReturnType<typeof createColonySnapshot>;
  memory: ColonyMemory;
  desiredWorkers: number;
  tick: number;
  interval: number;
  cpuUsed: number;
  log: (message: string) => void;
  cpuBucket: number;
  lowCpuBucket: number;
}): void {
  if (options.interval <= 0 || options.cpuBucket < options.lowCpuBucket) return;
  const lastLog = options.memory.lastStatusLog ?? 0;
  if (options.tick - lastLog < options.interval) return;

  const assignments = countAssignments(options.snapshot.workers);
  const mode = options.memory.emergency ? "EMERGENCY" : "NORMAL";
  options.log(
    `[colony ${options.memory.roomName}] status: RCL ${options.snapshot.rcl} ${mode} ` +
    `energy ${options.snapshot.energyAvailable}/${options.snapshot.energyCapacityAvailable} ` +
    `workers ${options.snapshot.workers.length}/${options.desiredWorkers} ` +
    `assignments H${assignments.harvest} D${assignments.deliver} U${assignments.upgrade} B${assignments.build} R${assignments.repair} ` +
    `sites ${options.snapshot.constructionSites.length} cpu ${options.cpuUsed.toFixed(1)}`
  );
  options.memory.lastStatusLog = options.tick;
}

function countAssignments(workers: ReturnType<typeof createColonySnapshot>["workers"]): {
  harvest: number;
  deliver: number;
  upgrade: number;
  build: number;
  repair: number;
} {
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

function logConstructionPlanUpdated(
  snapshot: ReturnType<typeof createColonySnapshot>,
  structureType: string,
  constants: SnapshotConstants,
  log: (message: string) => void
): void {
  const currentCount = countExistingConstructionTargets(snapshot, structureType, constants) + 1;
  const targetCount = constructionTargetCount(snapshot.rcl, structureType, constants);
  const label = targetCount === 1 ? structureType : `${structureType}s`;
  log(`[colony ${snapshot.room.name}] construction plan updated: ${currentCount}/${targetCount} ${label}`);
}

function countExistingConstructionTargets(
  snapshot: ReturnType<typeof createColonySnapshot>,
  structureType: string,
  constants: SnapshotConstants
): number {
  if (structureType === constants.STRUCTURE_EXTENSION) {
    return snapshot.extensions.length + snapshot.constructionSites.filter((site) => site.structureType === structureType).length;
  }
  if (structureType === constants.STRUCTURE_TOWER) {
    return snapshot.towers.length + snapshot.constructionSites.filter((site) => site.structureType === structureType).length;
  }
  return snapshot.energyStructures.filter((structure) => structure.structureType === structureType).length
    + snapshot.constructionSites.filter((site) => site.structureType === structureType).length;
}

function constructionTargetCount(
  rcl: number,
  structureType: string,
  constants: SnapshotConstants
): number {
  if (structureType === constants.STRUCTURE_EXTENSION) {
    if (rcl >= 4) return 20;
    if (rcl >= 3) return 10;
    return 5;
  }
  if (structureType === constants.STRUCTURE_CONTAINER) return 2;
  return 1;
}

function hasWorkAndCarry(creep: { body?: Array<{ type: string; hits?: number }> }): boolean {
  const liveParts = (creep.body ?? []).filter((part) => (part.hits ?? 1) > 0);
  return liveParts.some((part) => part.type === "work") && liveParts.some((part) => part.type === "carry");
}
