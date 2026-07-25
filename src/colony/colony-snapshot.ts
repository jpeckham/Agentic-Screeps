export interface SnapshotConstants {
  FIND_MY_STRUCTURES: number;
  FIND_STRUCTURES: number;
  FIND_MY_CREEPS: number;
  FIND_SOURCES: number;
  FIND_CONSTRUCTION_SITES: number;
  FIND_HOSTILE_CREEPS: number;
  STRUCTURE_SPAWN: string;
  STRUCTURE_EXTENSION: string;
  STRUCTURE_TOWER: string;
  STRUCTURE_CONTAINER: string;
  STRUCTURE_STORAGE: string;
  STRUCTURE_ROAD: string;
  RESOURCE_ENERGY: string;
  ERR_NOT_IN_RANGE: number;
}

export interface ColonySnapshot {
  room: AnyRoom;
  roomName: string;
  rcl: number;
  controller?: AnyController;
  creeps: AnyCreep[];
  workers: AnyCreep[];
  spawns: AnyStructure[];
  extensions: AnyStructure[];
  towers: AnyStructure[];
  energyStructures: AnyStructure[];
  sources: AnySource[];
  constructionSites: AnyConstructionSite[];
  damagedStructures: AnyStructure[];
  injuredFriendlies: AnyCreep[];
  hostiles: unknown[];
  energyAvailable: number;
  energyCapacityAvailable: number;
}

export type AnyRoom = {
  name: string;
  energyAvailable?: number;
  energyCapacityAvailable?: number;
  controller?: AnyController;
  find(type: number): unknown[];
  getTerrain?: () => { get(x: number, y: number): string | number };
  visual?: { text(message: string, x: number, y: number, options?: Record<string, unknown>): unknown };
};

export type AnyController = {
  id?: string;
  level?: number;
  my?: boolean;
  ticksToDowngrade?: number;
  pos?: AnyPosition;
};

export type AnyPosition = {
  x: number;
  y: number;
  roomName?: string;
  findClosestByRange?(items: unknown[] | number): unknown;
  isNearTo?(target: unknown): boolean;
};

export type AnySource = { id?: string; pos?: AnyPosition };

export type AnyConstructionSite = {
  id?: string;
  structureType?: string;
  progress?: number;
  progressTotal?: number;
  pos?: AnyPosition;
};

export type AnyStructure = {
  id?: string;
  name?: string;
  structureType?: string;
  hits?: number;
  hitsMax?: number;
  pos?: AnyPosition;
  spawning?: unknown;
  store?: {
    getFreeCapacity(resource?: string): number;
    getUsedCapacity(resource?: string): number;
  };
  spawnCreep?(body: string[], name: string, options: { memory: Record<string, unknown> }): number;
  attack?(target: unknown): number;
  heal?(target: unknown): number;
  repair?(target: unknown): number;
};

export type AnyCreep = {
  id?: string;
  name: string;
  ticksToLive?: number;
  body?: Array<{ type: string; hits?: number }>;
  hits?: number;
  hitsMax?: number;
  memory?: Record<string, unknown>;
  pos?: AnyPosition;
  store?: {
    getFreeCapacity(resource?: string): number;
    getUsedCapacity(resource?: string): number;
  };
  harvest?(target: unknown): number;
  transfer?(target: unknown, resource: string): number;
  upgradeController?(target: unknown): number;
  build?(target: unknown): number;
  repair?(target: unknown): number;
  withdraw?(target: unknown, resource: string): number;
  moveTo?(target: unknown): number;
};

export function createColonySnapshot(room: AnyRoom, constants: SnapshotConstants): ColonySnapshot {
  const myStructures = room.find(constants.FIND_MY_STRUCTURES).filter(isStructure);
  const allStructures = room.find(constants.FIND_STRUCTURES).filter(isStructure);
  const creeps = room.find(constants.FIND_MY_CREEPS).filter(isCreep);
  const sources = room.find(constants.FIND_SOURCES).filter(isSource);
  const constructionSites = room.find(constants.FIND_CONSTRUCTION_SITES).filter(isConstructionSite);
  const hostiles = room.find(constants.FIND_HOSTILE_CREEPS);
  const spawns = myStructures.filter((structure) => structure.structureType === constants.STRUCTURE_SPAWN);
  const extensions = myStructures.filter((structure) => structure.structureType === constants.STRUCTURE_EXTENSION);
  const towers = myStructures.filter((structure) => structure.structureType === constants.STRUCTURE_TOWER);
  const energyStructures = myStructures.filter((structure) =>
    [
      constants.STRUCTURE_SPAWN,
      constants.STRUCTURE_EXTENSION,
      constants.STRUCTURE_TOWER,
      constants.STRUCTURE_CONTAINER,
      constants.STRUCTURE_STORAGE
    ].includes(structure.structureType ?? "")
  );
  const damagedStructures = allStructures.filter((structure) =>
    typeof structure.hits === "number" &&
    typeof structure.hitsMax === "number" &&
    structure.hits < structure.hitsMax
  );
  const injuredFriendlies = creeps.filter((creep) =>
    typeof creep.hits === "number" &&
    typeof creep.hitsMax === "number" &&
    creep.hits < creep.hitsMax
  );

  return {
    room,
    roomName: room.name,
    rcl: room.controller?.level ?? 0,
    ...(room.controller ? { controller: room.controller } : {}),
    creeps,
    workers: creeps.filter((creep) => creep.memory?.["role"] === "worker" || creep.memory?.["role"] === "emergency-worker" || hasWorkBody(creep)),
    spawns,
    extensions,
    towers,
    energyStructures,
    sources,
    constructionSites,
    damagedStructures,
    injuredFriendlies,
    hostiles,
    energyAvailable: room.energyAvailable ?? 0,
    energyCapacityAvailable: room.energyCapacityAvailable ?? room.energyAvailable ?? 0
  };
}

function isStructure(value: unknown): value is AnyStructure {
  return typeof value === "object" && value !== null && "structureType" in value;
}

function isCreep(value: unknown): value is AnyCreep {
  return typeof value === "object" && value !== null && "name" in value;
}

function isSource(value: unknown): value is AnySource {
  return typeof value === "object" && value !== null && "id" in value;
}

function isConstructionSite(value: unknown): value is AnyConstructionSite {
  return typeof value === "object" && value !== null && "structureType" in value;
}

function hasWorkBody(creep: AnyCreep): boolean {
  return (creep.body ?? []).some((part) => part.type === "work");
}
