export interface BodyConstants {
  WORK: string;
  CARRY: string;
  MOVE: string;
}

const PART_COST: Record<string, number> = {
  work: 100,
  carry: 50,
  move: 50
};

export function bodyCost(body: string[]): number {
  return body.reduce((total, part) => total + (PART_COST[part] ?? 0), 0);
}

export function buildWorkerBody(
  energyAvailable: number,
  energyCapacity: number,
  constants: BodyConstants
): string[] {
  if (energyAvailable < 200 && energyCapacity < 200) return [];
  const budget = Math.max(0, Math.min(energyAvailable, energyCapacity));
  if (budget < 200) return [];

  const body = [constants.WORK, constants.CARRY, constants.MOVE];
  let remaining = budget - 200;
  const fullWorkerSet = [constants.WORK, constants.CARRY, constants.MOVE];
  const carryMoveSet = [constants.CARRY, constants.MOVE];

  while (remaining >= 200 && body.length + fullWorkerSet.length <= 50) {
    body.push(...fullWorkerSet);
    remaining -= 200;
  }

  if (remaining >= 100 && body.length + carryMoveSet.length <= 50) {
    body.push(...carryMoveSet);
  }

  return body;
}
