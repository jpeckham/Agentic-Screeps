export interface TowerConstants {
  RESOURCE_ENERGY: string;
}

export interface TowerLike {
  store?: { getUsedCapacity(resource?: string): number };
  attack(target: unknown): number;
  heal(target: unknown): number;
  repair(target: unknown): number;
}

interface RepairTarget {
  structureType?: string;
}

export function runTower(options: {
  tower: TowerLike;
  hostiles: unknown[];
  injuredFriendlies: unknown[];
  repairTargets: unknown[];
  constants: TowerConstants;
  reserve: number;
}): void {
  const hostile = options.hostiles[0];
  if (hostile) {
    options.tower.attack(hostile);
    return;
  }

  const injured = options.injuredFriendlies[0];
  if (injured) {
    options.tower.heal(injured);
    return;
  }

  const energy = options.tower.store?.getUsedCapacity(options.constants.RESOURCE_ENERGY) ?? 0;
  const repairTarget = [...options.repairTargets].sort(
    (left, right) => repairPriority(left) - repairPriority(right)
  )[0];
  if (repairTarget && energy > options.reserve) {
    options.tower.repair(repairTarget);
  }
}

function repairPriority(target: unknown): number {
  const structureType = (target as RepairTarget | undefined)?.structureType;
  if (structureType === "spawn") return 0;
  if (structureType === "tower") return 1;
  if (structureType === "extension") return 2;
  if (structureType === "container") return 3;
  if (structureType === "storage") return 4;
  if (structureType === "road") return 5;
  return 6;
}
