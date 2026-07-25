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
import { planConstruction } from "../construction/construction-planner.js";
import { runTower } from "../structures/tower-controller.js";
import type { TowerLike } from "../structures/tower-controller.js";
import { drawRoomStatusVisual } from "../visualization/room-status-visual.js";

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
}

export function runOwnedColonies(options: Omit<ColonyRunOptions, "memory"> & {
  memory: ColonyRootMemory;
}): void {
  for (const room of Object.values(options.game.rooms)) {
    if (room.controller?.my) {
      const snapshot = createColonySnapshot(room, options.constants);
      const colonyMemory = ensureColonyMemory(options.memory, room.name, snapshot.rcl, options.game.time);
      runColony({ ...options, memory: colonyMemory });
    }
  }
}

export function runColony(options: ColonyRunOptions): void {
  const config = mergeColonyConfig(options.config);
  const roomName = "roomName" in options.memory ? options.memory.roomName : firstOwnedRoomName(options.game);
  const room = options.game.rooms[roomName];
  if (!room) return;

  const snapshot = createColonySnapshot(room, options.constants);
  const memory = "roomName" in options.memory
    ? options.memory
    : ensureColonyMemory(options.memory, room.name, snapshot.rcl, options.game.time);
  const cpuStart = options.cpu.getUsed();

  logLifecycle(memory, snapshot.rcl, options.game.time, options.log);
  runTowers(snapshot, options.constants, config);

  const viableWorkers = snapshot.workers.filter((creep) =>
    hasWorkAndCarry(creep) && (creep.ticksToLive ?? 1500) > config.emergencyTtlThreshold
  );
  const expiringWorkers = snapshot.workers.filter((creep) =>
    hasWorkAndCarry(creep) && (creep.ticksToLive ?? 1500) <= config.replacementTtlThreshold
  );
  const replacementCount = snapshot.workers.filter((creep) => typeof creep.memory?.["replacing"] === "string").length;
  const plan = planWorkforce({
    roomName: room.name,
    rcl: snapshot.rcl,
    sourceCount: snapshot.sources.length,
    energyAvailable: snapshot.energyAvailable,
    energyCapacityAvailable: snapshot.energyCapacityAvailable,
    workerCount: viableWorkers.length,
    replacementCount,
    expiringWorkerCount: expiringWorkers.length,
    constructionSiteCount: snapshot.constructionSites.length
  });
  memory.workforceTarget = plan.desiredWorkers;
  updateEmergencyState(memory, plan.emergency, viableWorkers.length === 0 ? "no viable workers" : "critical workers expiring", options.log);

  spawnFromPlan(snapshot, memory, plan.spawnRequest, options);

  for (const creep of snapshot.workers) {
    runWorker(creep, snapshot, options.constants);
  }

  if (!memory.emergency && (options.cpu.bucket ?? 10000) >= config.lowCpuBucket) {
    const construction = planConstruction(snapshot, memory, options.constants, options.game.time);
    if (construction && typeof room["createConstructionSite" as keyof AnyRoom] === "function") {
      (room as AnyRoom & { createConstructionSite(x: number, y: number, type: string): number })
        .createConstructionSite(construction.x, construction.y, construction.structureType);
    }
  }

  const visualsEnabled = ("config" in options.memory ? options.memory.config?.visualsEnabled : undefined) ?? config.visualsEnabled;
  if (visualsEnabled && (options.cpu.bucket ?? 10000) >= config.lowCpuBucket) {
    drawRoomStatusVisual({
      snapshot,
      memory,
      workers: snapshot.workers.length,
      desiredWorkers: plan.desiredWorkers,
      cpuUsed: options.cpu.getUsed() - cpuStart
    });
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
  config: ColonyConfig
): void {
  const repairTargets = snapshot.damagedStructures.filter((structure) =>
    structure.structureType !== "constructedWall" && structure.structureType !== "rampart"
  );
  for (const tower of snapshot.towers) {
    if (tower.attack && tower.heal && tower.repair) {
      runTower({
        tower: tower as TowerLike,
        hostiles: snapshot.hostiles,
        injuredFriendlies: [],
        repairTargets,
        constants,
        reserve: config.towerEnergyReserve
      });
    }
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

function hasWorkAndCarry(creep: { body?: Array<{ type: string; hits?: number }> }): boolean {
  const liveParts = (creep.body ?? []).filter((part) => (part.hits ?? 1) > 0);
  return liveParts.some((part) => part.type === "work") && liveParts.some((part) => part.type === "carry");
}
