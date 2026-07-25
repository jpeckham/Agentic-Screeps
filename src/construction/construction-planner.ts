import type { ColonySnapshot } from "../colony/colony-snapshot.js";
import type { ColonyMemory } from "../colony/colony-state.js";
import type { SnapshotConstants } from "../colony/colony-snapshot.js";

export interface ConstructionPlan {
  structureType: string;
  x: number;
  y: number;
}

export function planConstruction(
  snapshot: ColonySnapshot,
  memory: ColonyMemory,
  constants: SnapshotConstants,
  tick: number
): ConstructionPlan | undefined {
  if (!memory.forceReplan && memory.lastPlanTick > 0 && tick - memory.lastPlanTick < 10) {
    return undefined;
  }
  memory.lastPlanTick = tick;
  memory.forceReplan = false;

  const desired = desiredStructure(snapshot, constants);
  if (!desired) return undefined;
  if (hasStructureOrSite(snapshot, desired, constants)) return undefined;

  const origin = snapshot.spawns[0]?.pos ?? snapshot.controller?.pos;
  if (!origin) return undefined;
  const plan = firstOpenNear(origin.x, origin.y, desired);
  memory.lastConstructionPlan = { tick, rcl: snapshot.rcl, ...plan };
  return plan;
}

function desiredStructure(snapshot: ColonySnapshot, constants: SnapshotConstants): string | undefined {
  if (snapshot.rcl >= 3) {
    const towers = snapshot.towers.length + snapshot.constructionSites.filter((site) => site.structureType === constants.STRUCTURE_TOWER).length;
    if (towers < 1) return constants.STRUCTURE_TOWER;
  }
  if (snapshot.rcl >= 2) {
    const extensions = snapshot.extensions.length + snapshot.constructionSites.filter((site) => site.structureType === constants.STRUCTURE_EXTENSION).length;
    const target = snapshot.rcl >= 3 ? 10 : 5;
    if (extensions < target) return constants.STRUCTURE_EXTENSION;
  }
  if (snapshot.rcl >= 4) {
    const storageCount = countStructuresAndSites(snapshot, constants.STRUCTURE_STORAGE);
    if (storageCount < 1) return constants.STRUCTURE_STORAGE;
  }
  if (snapshot.rcl >= 3) {
    const containerCount = countStructuresAndSites(snapshot, constants.STRUCTURE_CONTAINER);
    if (containerCount < Math.max(1, snapshot.sources.length)) return constants.STRUCTURE_CONTAINER;
  }
  return undefined;
}

function hasStructureOrSite(snapshot: ColonySnapshot, structureType: string, constants: SnapshotConstants): boolean {
  if (structureType === constants.STRUCTURE_TOWER) {
    return snapshot.towers.length > 0 || snapshot.constructionSites.some((site) => site.structureType === structureType);
  }
  if (structureType === constants.STRUCTURE_STORAGE) {
    return countStructuresAndSites(snapshot, structureType) > 0;
  }
  return false;
}

function countStructuresAndSites(snapshot: ColonySnapshot, structureType: string): number {
  const structureCount = snapshot.energyStructures.filter((structure) => structure.structureType === structureType).length;
  const siteCount = snapshot.constructionSites.filter((site) => site.structureType === structureType).length;
  return structureCount + siteCount;
}

function firstOpenNear(x: number, y: number, structureType: string): ConstructionPlan {
  const px = Math.max(2, Math.min(47, x + 2));
  const py = Math.max(2, Math.min(47, y));
  return { structureType, x: px, y: py };
}
