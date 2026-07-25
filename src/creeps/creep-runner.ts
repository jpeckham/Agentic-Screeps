import type {
  AnyConstructionSite,
  AnyCreep,
  AnySource,
  AnyStructure,
  ColonySnapshot,
  SnapshotConstants
} from "../colony/colony-snapshot.js";
import type { ColonyCreepMemory } from "../colony/colony-state.js";

export function runWorker(
  creep: AnyCreep,
  snapshot: ColonySnapshot,
  constants: SnapshotConstants
): void {
  const memory = ensureWorkerMemory(creep, snapshot.roomName);
  updateMode(creep, memory, constants);

  if (memory.mode === "acquire") {
    acquireEnergy(creep, snapshot, constants, memory);
    return;
  }

  performWork(creep, snapshot, constants, memory);
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
  if (free === 0) {
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
): void {
  const storage = snapshot.energyStructures.find((structure) =>
    [constants.STRUCTURE_CONTAINER, constants.STRUCTURE_STORAGE].includes(structure.structureType ?? "") &&
    (structure.store?.getUsedCapacity(constants.RESOURCE_ENERGY) ?? 0) > 0
  );
  if (storage && creep.withdraw) {
    memory.assignment = { type: "harvest", ...(storage.id ? { targetId: storage.id } : {}) };
    creep.withdraw(storage, constants.RESOURCE_ENERGY);
    return;
  }

  const source = chooseSource(creep, snapshot, memory);
  if (source && creep.harvest) {
    memory.assignment = { type: "harvest", ...(source.id ? { sourceId: source.id } : {}) };
    creep.harvest(source);
  }
}

function performWork(
  creep: AnyCreep,
  snapshot: ColonySnapshot,
  constants: SnapshotConstants,
  memory: ColonyCreepMemory
): void {
  const refillTarget = findRefillTarget(snapshot, constants);
  if (refillTarget && creep.transfer) {
    memory.assignment = { type: "deliver", ...(refillTarget.id ? { targetId: refillTarget.id } : {}) };
    creep.transfer(refillTarget, constants.RESOURCE_ENERGY);
    return;
  }

  const criticalBuild = findBuildTarget(snapshot, constants, true);
  if (criticalBuild && creep.build) {
    memory.assignment = { type: "build", ...(criticalBuild.id ? { targetId: criticalBuild.id } : {}) };
    creep.build(criticalBuild);
    return;
  }

  if (controllerNeedsPriority(snapshot) && snapshot.controller && creep.upgradeController) {
    memory.assignment = { type: "upgrade", ...(snapshot.controller.id ? { targetId: snapshot.controller.id } : {}) };
    creep.upgradeController(snapshot.controller);
    return;
  }

  const buildTarget = findBuildTarget(snapshot, constants, false);
  if (buildTarget && creep.build) {
    memory.assignment = { type: "build", ...(buildTarget.id ? { targetId: buildTarget.id } : {}) };
    creep.build(buildTarget);
    return;
  }

  if (snapshot.controller && creep.upgradeController) {
    memory.assignment = { type: "upgrade", ...(snapshot.controller.id ? { targetId: snapshot.controller.id } : {}) };
    creep.upgradeController(snapshot.controller);
    return;
  }

  const repairTarget = findRepairTarget(snapshot, constants);
  if (repairTarget && creep.repair) {
    memory.assignment = { type: "repair", ...(repairTarget.id ? { targetId: repairTarget.id } : {}) };
    creep.repair(repairTarget);
    return;
  }

  delete memory.assignment;
}

function chooseSource(
  creep: AnyCreep,
  snapshot: ColonySnapshot,
  memory: ColonyCreepMemory
): AnySource | undefined {
  const assigned = snapshot.sources.find((source) => source.id && source.id === memory.assignment?.sourceId);
  if (assigned) return assigned;

  const assignedCounts = new Map<string, number>();
  for (const source of snapshot.sources) {
    if (source.id) assignedCounts.set(source.id, 0);
  }
  for (const worker of snapshot.workers) {
    if (worker.name === creep.name) continue;
    const sourceId = worker.memory?.["assignment"] &&
      typeof worker.memory["assignment"] === "object" &&
      "sourceId" in worker.memory["assignment"]
      ? worker.memory["assignment"].sourceId
      : undefined;
    if (typeof sourceId === "string" && assignedCounts.has(sourceId)) {
      assignedCounts.set(sourceId, (assignedCounts.get(sourceId) ?? 0) + 1);
    }
  }

  const leastAssigned = snapshot.sources
    .filter((source) => source.id)
    .sort((left, right) => (assignedCounts.get(left.id ?? "") ?? 0) - (assignedCounts.get(right.id ?? "") ?? 0))[0];
  if (leastAssigned) return leastAssigned;

  const closest = creep.pos?.findClosestByRange?.(snapshot.sources);
  if (isSource(closest)) return closest;
  return snapshot.sources[0];
}

function findRefillTarget(snapshot: ColonySnapshot, constants: SnapshotConstants): AnyStructure | undefined {
  return snapshot.energyStructures.find((structure) => {
    if (structure.structureType === constants.STRUCTURE_TOWER) {
      return (structure.store?.getFreeCapacity(constants.RESOURCE_ENERGY) ?? 0) > 0 &&
        (structure.store?.getUsedCapacity(constants.RESOURCE_ENERGY) ?? 0) < 500;
    }
    return (structure.store?.getFreeCapacity(constants.RESOURCE_ENERGY) ?? 0) > 0;
  });
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

function controllerNeedsPriority(snapshot: ColonySnapshot): boolean {
  return (snapshot.controller?.ticksToDowngrade ?? 99999) < 4000;
}

function findRepairTarget(snapshot: ColonySnapshot, constants: SnapshotConstants): AnyStructure | undefined {
  return snapshot.damagedStructures.find((structure) => {
    if (!structure.hits || !structure.hitsMax) return false;
    if (structure.structureType === "constructedWall" || structure.structureType === "rampart") {
      return structure.hits < 10000;
    }
    if (structure.structureType === constants.STRUCTURE_ROAD) return structure.hits / structure.hitsMax < 0.35;
    return structure.hits / structure.hitsMax < 0.5;
  });
}

function isSource(value: unknown): value is AnySource {
  return typeof value === "object" && value !== null && "id" in value;
}
