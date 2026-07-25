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
  const plan = firstOpenNear(snapshot, origin.x, origin.y, desired);
  if (!plan) return undefined;
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

function firstOpenNear(
  snapshot: ColonySnapshot,
  x: number,
  y: number,
  structureType: string
): ConstructionPlan | undefined {
  const offsets = [
    [2, 0],
    [2, 1],
    [2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
    [-2, 0],
    [-2, 1],
    [-2, -1],
    [0, 2],
    [0, -2],
    [3, 0],
    [0, 3],
    [-3, 0],
    [0, -3]
  ] as const;

  for (const [dx, dy] of offsets) {
    const px = x + dx;
    const py = y + dy;
    if (isBuildable(snapshot, px, py)) return { structureType, x: px, y: py };
  }
  return undefined;
}

function isBuildable(snapshot: ColonySnapshot, x: number, y: number): boolean {
  if (x < 2 || x > 47 || y < 2 || y > 47) return false;
  if (isWall(snapshot, x, y)) return false;
  return !occupiedPositions(snapshot).has(positionKey(x, y));
}

function isWall(snapshot: ColonySnapshot, x: number, y: number): boolean {
  const terrain = snapshot.room.getTerrain?.().get(x, y);
  if (terrain === "wall") return true;
  return typeof terrain === "number" && (terrain & 1) !== 0;
}

function occupiedPositions(snapshot: ColonySnapshot): Set<string> {
  const occupied = new Set<string>();
  for (const item of [
    ...snapshot.spawns,
    ...snapshot.energyStructures,
    ...snapshot.sources,
    ...snapshot.constructionSites
  ]) {
    if (item.pos) occupied.add(positionKey(item.pos.x, item.pos.y));
  }
  if (snapshot.controller?.pos) {
    occupied.add(positionKey(snapshot.controller.pos.x, snapshot.controller.pos.y));
  }
  return occupied;
}

function positionKey(x: number, y: number): string {
  return `${x},${y}`;
}
