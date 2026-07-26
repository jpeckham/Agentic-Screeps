import type {
  AnyConstructionSite,
  AnyCreep,
  AnySource,
  AnyStructure,
  ColonySnapshot,
  SnapshotConstants
} from "../colony/colony-snapshot.js";
import type { ColonyCreepMemory } from "../colony/colony-state.js";

export interface WorkerPriorityConfig {
  controllerEmergencyThreshold: number;
  repairThreshold: number;
  roadRepairThreshold: number;
  wallStarterThreshold: number;
  towerEnergyReserve: number;
}

const DEFAULT_WORKER_PRIORITY_CONFIG: WorkerPriorityConfig = {
  controllerEmergencyThreshold: 4000,
  repairThreshold: 0.5,
  roadRepairThreshold: 0.35,
  wallStarterThreshold: 10000,
  towerEnergyReserve: 500
};

export function runWorker(
  creep: AnyCreep,
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  config: WorkerPriorityConfig = DEFAULT_WORKER_PRIORITY_CONFIG
): void {
  const memory = ensureWorkerMemory(creep, snapshot.roomName);
  updateMode(creep, memory, constants);

  if (memory.mode === "acquire") {
    const acquired = acquireEnergy(creep, snapshot, constants, memory);
    const used = creep.store?.getUsedCapacity(constants.RESOURCE_ENERGY) ?? 0;
    if (!acquired && used > 0) {
      memory.mode = "work";
      performWork(creep, snapshot, constants, memory, config);
    }
    return;
  }

  performWork(creep, snapshot, constants, memory, config);
}

function ensureWorkerMemory(creep: AnyCreep, roomName: string): ColonyCreepMemory {
  creep.memory ??= {};
  creep.memory["colony"] = typeof creep.memory["colony"] === "string" ? creep.memory["colony"] : roomName;
  creep.memory["role"] = creep.memory["role"] === "emergency-worker" ? "emergency-worker" : "worker";
  creep.memory["mode"] = creep.memory["mode"] === "work" ? "work" : "acquire";
  return creep.memory as unknown as ColonyCreepMemory;
}

function updateMode(creep: AnyCreep, memory: ColonyCreepMemory, constants: SnapshotConstants): void {
  const free = creep.store?.getFreeCapacity(constants.RESOURCE_ENERGY) ?? 0;
  const used = creep.store?.getUsedCapacity(constants.RESOURCE_ENERGY) ?? 0;
  if (free <= used && used > 0) {
    memory.mode = "work";
    if (memory.assignment?.type === "harvest") delete memory.assignment;
    return;
  }
  if (used === 0) {
    memory.mode = "acquire";
    if (memory.assignment?.type !== "harvest") delete memory.assignment;
  }
}

function acquireEnergy(
  creep: AnyCreep,
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  memory: ColonyCreepMemory
): boolean {
  const storage = snapshot.energyStructures.find((structure) =>
    [constants.STRUCTURE_CONTAINER, constants.STRUCTURE_STORAGE].includes(structure.structureType ?? "") &&
    (structure.store?.getUsedCapacity(constants.RESOURCE_ENERGY) ?? 0) > 0
  );
  if (storage && creep.withdraw && hasLivePart(creep, constants.CARRY)) {
    memory.assignment = { type: "harvest", ...(storage.id ? { targetId: storage.id } : {}) };
    actOrMove(creep, storage, creep.withdraw(storage, constants.RESOURCE_ENERGY), constants);
    return true;
  }

  const source = chooseSource(creep, snapshot, memory);
  if (source && creep.harvest && hasLivePart(creep, constants.WORK) && hasLivePart(creep, constants.CARRY)) {
    memory.assignment = { type: "harvest", ...(source.id ? { sourceId: source.id } : {}) };
    harvestOrMove(creep, source, snapshot, creep.harvest(source), constants);
    return true;
  }
  return false;
}

function performWork(
  creep: AnyCreep,
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  memory: ColonyCreepMemory,
  config: WorkerPriorityConfig
): void {
  const refillTarget = findRefillTarget(snapshot, constants, config);
  if (refillTarget && creep.transfer && hasLivePart(creep, constants.CARRY)) {
    memory.assignment = { type: "deliver", ...(refillTarget.id ? { targetId: refillTarget.id } : {}) };
    actOrMove(creep, refillTarget, creep.transfer(refillTarget, constants.RESOURCE_ENERGY), constants);
    return;
  }

  const criticalBuild = findBuildTarget(snapshot, constants, true);
  if (
    memory.assignment?.type === "upgrade" &&
    snapshot.controller &&
    creep.upgradeController &&
    canSpendWorkEnergy(creep, constants)
  ) {
    memory.assignment = { type: "upgrade", ...(snapshot.controller.id ? { targetId: snapshot.controller.id } : {}) };
    actOrMove(creep, snapshot.controller, creep.upgradeController(snapshot.controller), constants);
    return;
  }

  if (
    criticalBuild &&
    criticalBuildSaturated(snapshot, constants, criticalBuild) &&
    snapshot.controller &&
    creep.upgradeController &&
    canSpendWorkEnergy(creep, constants)
  ) {
    memory.assignment = { type: "upgrade", ...(snapshot.controller.id ? { targetId: snapshot.controller.id } : {}) };
    actOrMove(creep, snapshot.controller, creep.upgradeController(snapshot.controller), constants);
    return;
  }

  if (criticalBuild && inRange(creep.pos, criticalBuild.pos, 3) && creep.build && canSpendWorkEnergy(creep, constants)) {
    memory.assignment = { type: "build", ...(criticalBuild.id ? { targetId: criticalBuild.id } : {}) };
    actOrMove(creep, criticalBuild, creep.build(criticalBuild), constants);
    return;
  }

  if (controllerNeedsPriority(snapshot, config) && snapshot.controller && creep.upgradeController && canSpendWorkEnergy(creep, constants)) {
    memory.assignment = { type: "upgrade", ...(snapshot.controller.id ? { targetId: snapshot.controller.id } : {}) };
    actOrMove(creep, snapshot.controller, creep.upgradeController(snapshot.controller), constants);
    return;
  }

  if (criticalBuild && creep.build && canSpendWorkEnergy(creep, constants)) {
    memory.assignment = { type: "build", ...(criticalBuild.id ? { targetId: criticalBuild.id } : {}) };
    actOrMove(creep, criticalBuild, creep.build(criticalBuild), constants);
    return;
  }

  const criticalRepairTarget = findRepairTarget(snapshot, constants, true, config);
  if (criticalRepairTarget && creep.repair && canSpendWorkEnergy(creep, constants)) {
    memory.assignment = { type: "repair", ...(criticalRepairTarget.id ? { targetId: criticalRepairTarget.id } : {}) };
    actOrMove(creep, criticalRepairTarget, creep.repair(criticalRepairTarget), constants);
    return;
  }

  const buildTarget = findBuildTarget(snapshot, constants, false);
  if (buildTarget && creep.build && canSpendWorkEnergy(creep, constants)) {
    memory.assignment = { type: "build", ...(buildTarget.id ? { targetId: buildTarget.id } : {}) };
    actOrMove(creep, buildTarget, creep.build(buildTarget), constants);
    return;
  }

  if (snapshot.controller && creep.upgradeController && canSpendWorkEnergy(creep, constants)) {
    memory.assignment = { type: "upgrade", ...(snapshot.controller.id ? { targetId: snapshot.controller.id } : {}) };
    actOrMove(creep, snapshot.controller, creep.upgradeController(snapshot.controller), constants);
    return;
  }

  const repairTarget = findRepairTarget(snapshot, constants, false, config);
  if (repairTarget && creep.repair && canSpendWorkEnergy(creep, constants)) {
    memory.assignment = { type: "repair", ...(repairTarget.id ? { targetId: repairTarget.id } : {}) };
    actOrMove(creep, repairTarget, creep.repair(repairTarget), constants);
    return;
  }

  delete memory.assignment;
}

function chooseSource(
  creep: AnyCreep,
  snapshot: ColonySnapshot,
  memory: ColonyCreepMemory
): AnySource | undefined {
  const adjacent = snapshot.sources.find((source) => isAdjacent(creep.pos, source.pos));
  if (adjacent) return adjacent;

  const nearby = nearestSourceWithin(creep, snapshot.sources, 3, snapshot);
  if (nearby) return nearby;

  const assignedCounts = sourceAssignmentCounts(snapshot);
  const assigned = snapshot.sources.find((source) => source.id && source.id === memory.assignment?.sourceId);
  if (assigned?.id) {
    const lowestAssignedCount = Math.min(...assignedCounts.values());
    const assignedCount = assignedCounts.get(assigned.id) ?? 0;
    if (assignedCount <= lowestAssignedCount) return assigned;
  }

  const leastAssigned = snapshot.sources
    .filter((source) => source.id)
    .sort((left, right) => (assignedCounts.get(left.id ?? "") ?? 0) - (assignedCounts.get(right.id ?? "") ?? 0))[0];
  if (leastAssigned) return leastAssigned;

  const closest = creep.pos?.findClosestByRange?.(snapshot.sources);
  if (isSource(closest)) return closest;
  return snapshot.sources[0];
}

function sourceAssignmentCounts(snapshot: ColonySnapshot): Map<string, number> {
  const assignedCounts = new Map<string, number>();
  for (const source of snapshot.sources) {
    if (source.id) assignedCounts.set(source.id, 0);
  }
  for (const worker of snapshot.workers) {
    const sourceId = worker.memory?.["assignment"] &&
      typeof worker.memory["assignment"] === "object" &&
      "sourceId" in worker.memory["assignment"]
      ? worker.memory["assignment"].sourceId
      : undefined;
    if (typeof sourceId === "string" && assignedCounts.has(sourceId)) {
      assignedCounts.set(sourceId, (assignedCounts.get(sourceId) ?? 0) + 1);
    }
  }
  return assignedCounts;
}

function findRefillTarget(
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  config: WorkerPriorityConfig
): AnyStructure | undefined {
  const priorities = [
    constants.STRUCTURE_SPAWN,
    constants.STRUCTURE_EXTENSION,
    constants.STRUCTURE_TOWER
  ];
  return snapshot.energyStructures
    .filter((structure) => needsEnergy(structure, constants, config))
    .sort((left, right) =>
      priorities.indexOf(left.structureType ?? "") - priorities.indexOf(right.structureType ?? "")
    )[0];
}

function needsEnergy(
  structure: AnyStructure,
  constants: SnapshotConstants,
  config: WorkerPriorityConfig
): boolean {
  if (![
    constants.STRUCTURE_SPAWN,
    constants.STRUCTURE_EXTENSION,
    constants.STRUCTURE_TOWER
  ].includes(structure.structureType ?? "")) {
    return false;
  }
  const free = structure.store?.getFreeCapacity(constants.RESOURCE_ENERGY) ?? 0;
  if (free <= 0) return false;
  if (structure.structureType === constants.STRUCTURE_TOWER) {
    return (structure.store?.getUsedCapacity(constants.RESOURCE_ENERGY) ?? 0) < config.towerEnergyReserve;
  }
  return true;
}

function findBuildTarget(
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  criticalOnly: boolean
): AnyConstructionSite | undefined {
  const priorities = criticalOnly
    ? [constants.STRUCTURE_TOWER, constants.STRUCTURE_EXTENSION]
    : [
        constants.STRUCTURE_TOWER,
        constants.STRUCTURE_EXTENSION,
        constants.STRUCTURE_CONTAINER,
        constants.STRUCTURE_STORAGE,
        constants.STRUCTURE_ROAD
      ];
  return snapshot.constructionSites
    .filter((site) => priorities.includes(site.structureType ?? ""))
    .sort((left, right) => priorities.indexOf(left.structureType ?? "") - priorities.indexOf(right.structureType ?? ""))[0];
}

function criticalBuildSaturated(
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  criticalBuild: AnyConstructionSite
): boolean {
  const builderLimit = criticalBuildBuilderLimit(snapshot, constants, criticalBuild);
  const builders = criticalBuildBuilderCount(snapshot, criticalBuild);
  return builders >= builderLimit;
}

function criticalBuildBuilderCount(
  snapshot: ColonySnapshot,
  criticalBuild: AnyConstructionSite
): number {
  const criticalSiteIds = new Set(
    snapshot.constructionSites
      .filter((site) => site.structureType === criticalBuild.structureType && site.id)
      .map((site) => site.id)
  );
  let builders = 0;
  for (const worker of snapshot.workers) {
    const assignment = worker.memory?.["assignment"];
    if (
      typeof assignment === "object" &&
      assignment !== null &&
      "type" in assignment &&
      assignment.type === "build" &&
      "targetId" in assignment &&
      typeof assignment.targetId === "string" &&
      criticalSiteIds.has(assignment.targetId)
    ) {
      builders += 1;
    }
  }
  return builders;
}

function criticalBuildBuilderLimit(
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  criticalBuild: AnyConstructionSite
): number {
  if (criticalBuild.structureType === constants.STRUCTURE_TOWER) return 3;
  if (criticalBuild.structureType === constants.STRUCTURE_EXTENSION && snapshot.workers.length >= 5) return 3;
  return 2;
}

function controllerNeedsPriority(snapshot: ColonySnapshot, config: WorkerPriorityConfig): boolean {
  return (snapshot.controller?.ticksToDowngrade ?? 99999) < config.controllerEmergencyThreshold;
}

function findRepairTarget(
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  criticalOnly: boolean,
  config: WorkerPriorityConfig
): AnyStructure | undefined {
  return snapshot.damagedStructures.find((structure) => {
    if (!structure.hits || !structure.hitsMax) return false;
    if (structure.structureType === "constructedWall" || structure.structureType === "rampart") {
      return !criticalOnly && structure.hits < config.wallStarterThreshold;
    }
    if (structure.structureType === constants.STRUCTURE_ROAD) {
      return !criticalOnly && structure.hits / structure.hitsMax < config.roadRepairThreshold;
    }
    const ratio = structure.hits / structure.hitsMax;
    return criticalOnly
      ? ratio < Math.min(0.4, config.repairThreshold)
      : ratio < config.repairThreshold;
  });
}

function actOrMove(
  creep: AnyCreep,
  target: unknown,
  result: number,
  constants: SnapshotConstants
): void {
  if (result === constants.ERR_NOT_IN_RANGE) creep.moveTo?.(target);
}

function harvestOrMove(
  creep: AnyCreep,
  source: AnySource,
  snapshot: ColonySnapshot,
  result: number,
  constants: SnapshotConstants
): void {
  if (result !== constants.ERR_NOT_IN_RANGE) return;
  const target = rangeBetween(creep.pos, source.pos) <= 3
    ? openSourceAccessTarget(creep, source, snapshot) ?? source
    : source;
  creep.moveTo?.(target);
}

function openSourceAccessTarget(
  creep: AnyCreep,
  source: AnySource,
  snapshot: ColonySnapshot
): { pos: { x: number; y: number; roomName?: string } } | { x: number; y: number; roomName: string } | undefined {
  if (!source.pos) return undefined;
  const occupied = new Set<string>();
  for (const other of [
    ...snapshot.creeps,
    ...snapshot.spawns,
    ...snapshot.energyStructures
  ]) {
    if (other !== creep && other.pos) occupied.add(positionKey(other.pos.x, other.pos.y));
  }
  return adjacentPositions(source.pos.x, source.pos.y)
    .filter(([x, y]) => !isWall(snapshot, x, y) && !occupied.has(positionKey(x, y)))
    .sort((left, right) =>
      rangeBetween(creep.pos, { x: left[0], y: left[1] }) - rangeBetween(creep.pos, { x: right[0], y: right[1] })
    )
    .map(([x, y]) => createMoveTarget(x, y, source.pos?.roomName ?? snapshot.roomName))[0];
}

function createMoveTarget(
  x: number,
  y: number,
  roomName: string
): { pos: { x: number; y: number; roomName?: string } } | { x: number; y: number; roomName: string } {
  const roomPosition = (globalThis as typeof globalThis & {
    RoomPosition?: new (x: number, y: number, roomName: string) => { x: number; y: number; roomName: string };
  }).RoomPosition;
  return roomPosition ? new roomPosition(x, y, roomName) : { pos: { x, y, roomName } };
}

function canSpendWorkEnergy(creep: AnyCreep, constants: SnapshotConstants): boolean {
  return hasLivePart(creep, constants.WORK) && hasLivePart(creep, constants.CARRY);
}

function hasLivePart(creep: AnyCreep, partType: string): boolean {
  return (creep.body ?? []).some((part) => part.type === partType && (part.hits ?? 1) > 0);
}

function inRange(left: { x: number; y: number } | undefined, right: { x: number; y: number } | undefined, range: number): boolean {
  return Boolean(left && right && Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= range);
}

function isAdjacent(left: { x: number; y: number } | undefined, right: { x: number; y: number } | undefined): boolean {
  return inRange(left, right, 1);
}

function nearestSourceWithin(
  creep: AnyCreep,
  sources: AnySource[],
  range: number,
  snapshot: ColonySnapshot
): AnySource | undefined {
  return sources
    .filter((source) => inRange(creep.pos, source.pos, range) && sourceHasOpenAccess(creep, source, snapshot))
    .sort((left, right) => rangeBetween(creep.pos, left.pos) - rangeBetween(creep.pos, right.pos))[0];
}

function sourceHasOpenAccess(creep: AnyCreep, source: AnySource, snapshot: ColonySnapshot): boolean {
  if (!source.pos) return false;
  const occupied = new Set<string>();
  for (const other of [
    ...snapshot.creeps,
    ...snapshot.spawns,
    ...snapshot.energyStructures,
    ...snapshot.constructionSites
  ]) {
    if (other !== creep && other.pos) occupied.add(positionKey(other.pos.x, other.pos.y));
  }
  return adjacentPositions(source.pos.x, source.pos.y).some(([x, y]) =>
    !isWall(snapshot, x, y) && !occupied.has(positionKey(x, y))
  );
}

function rangeBetween(left: { x: number; y: number } | undefined, right: { x: number; y: number } | undefined): number {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function isWall(snapshot: ColonySnapshot, x: number, y: number): boolean {
  const terrain = snapshot.room.getTerrain?.().get(x, y);
  if (terrain === "wall") return true;
  return typeof terrain === "number" && (terrain & 1) !== 0;
}

function adjacentPositions(x: number, y: number): Array<[number, number]> {
  return [
    [x - 1, y - 1],
    [x, y - 1],
    [x + 1, y - 1],
    [x - 1, y],
    [x + 1, y],
    [x - 1, y + 1],
    [x, y + 1],
    [x + 1, y + 1]
  ];
}

function positionKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isSource(value: unknown): value is AnySource {
  return typeof value === "object" && value !== null && "id" in value;
}
