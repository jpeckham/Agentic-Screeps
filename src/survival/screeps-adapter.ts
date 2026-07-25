import type { SurvivalHooks } from "./survival-loop.js";

interface AdapterConstants {
  FIND_MY_STRUCTURES: number;
  FIND_MY_CREEPS: number;
  FIND_HOSTILE_CREEPS: number;
  FIND_SOURCES_ACTIVE: number;
  STRUCTURE_TOWER: string;
  STRUCTURE_SPAWN: string;
  WORK: string;
  CARRY: string;
  MOVE: string;
  ERR_NOT_IN_RANGE: number;
  RESOURCE_ENERGY: string;
}

interface AdapterGame {
  rooms: Record<string, AdapterRoom>;
  time: number;
}

interface AdapterRoom {
  controller?: AdapterController;
  energyAvailable?: number;
  find(type: number): unknown[];
}

interface AdapterPosition {
  findClosestByRange(type: number): unknown;
}

interface AdapterTower {
  structureType?: string;
  pos: AdapterPosition;
  attack(target: unknown): number;
}

interface AdapterSpawn {
  name: string;
  structureType?: string;
  spawning?: unknown;
  room?: { energyAvailable?: number };
  spawnCreep(body: string[], name: string, options: { memory: Record<string, string> }): number;
}

interface AdapterCreep {
  memory?: Record<string, unknown>;
  store?: {
    getFreeCapacity(resource?: string): number;
    getUsedCapacity(resource?: string): number;
  };
  pos: AdapterPosition;
  harvest(target: unknown): number;
  transfer?(target: unknown, resource: string): number;
  upgradeController?(target: unknown): number;
}

type AdapterController = object;

export function createScreepsSurvivalHooks(options: {
  Game: AdapterGame;
  constants: AdapterConstants;
}): SurvivalHooks {
  const rooms = Object.values(options.Game.rooms);
  const structures = rooms.flatMap((room) =>
    room.find(options.constants.FIND_MY_STRUCTURES)
  );
  const creeps = rooms
    .flatMap((room) => room.find(options.constants.FIND_MY_CREEPS))
    .filter(isCreep);
  const emergencyCreeps = creeps.filter(
    (creep) => creep.memory?.["role"] === "emergencyHarvester"
  );

  return {
    viableHarvesters: emergencyCreeps.length,
    towers: structures.filter(isTower).map((tower) => ({
      runDefense: () => {
        const hostile = tower.pos.findClosestByRange(options.constants.FIND_HOSTILE_CREEPS);
        if (hostile) tower.attack(hostile);
      }
    })),
    spawns: structures.filter(isSpawn).map((spawn) => ({
      spawnEmergencyHarvester: () => {
        if (spawn.spawning || (spawn.room?.energyAvailable ?? 0) < 200) return;
        spawn.spawnCreep(
          [options.constants.WORK, options.constants.CARRY, options.constants.MOVE],
          `emergency-${options.Game.time}-${spawn.name}`,
          { memory: { role: "emergencyHarvester" } }
        );
      }
    })),
    controllers: rooms
      .map((room) => room.controller)
      .filter((controller): controller is AdapterController => Boolean(controller))
      .map((controller) => ({
        preventDowngrade: () => {
          const worker = emergencyCreeps.find((creep) =>
            (creep.store?.getUsedCapacity(options.constants.RESOURCE_ENERGY) ?? 0) > 0
          );
          worker?.upgradeController?.(controller);
        }
      })),
    emergencyCreeps: emergencyCreeps.map((creep) => ({
      runEmergencyWork: () => {
        if ((creep.store?.getFreeCapacity(options.constants.RESOURCE_ENERGY) ?? 0) > 0) {
          const source = creep.pos.findClosestByRange(options.constants.FIND_SOURCES_ACTIVE);
          if (source) creep.harvest(source);
        }
      }
    }))
  };
}

export function createDefaultScreepsSurvivalHooks(): SurvivalHooks {
  return createScreepsSurvivalHooks({
    Game: Game as unknown as AdapterGame,
    constants: {
      FIND_MY_STRUCTURES,
      FIND_MY_CREEPS,
      FIND_HOSTILE_CREEPS,
      FIND_SOURCES_ACTIVE,
      STRUCTURE_TOWER,
      STRUCTURE_SPAWN,
      WORK,
      CARRY,
      MOVE,
      ERR_NOT_IN_RANGE,
      RESOURCE_ENERGY
    }
  });
}

function isTower(value: unknown): value is AdapterTower {
  return (
    typeof value === "object" &&
    value !== null &&
    "attack" in value &&
    "pos" in value
  );
}

function isSpawn(value: unknown): value is AdapterSpawn {
  return (
    typeof value === "object" &&
    value !== null &&
    "spawnCreep" in value &&
    "name" in value
  );
}

function isCreep(value: unknown): value is AdapterCreep {
  return (
    typeof value === "object" &&
    value !== null &&
    "harvest" in value &&
    "pos" in value
  );
}
