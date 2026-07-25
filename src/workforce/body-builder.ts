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
  const pattern = [constants.WORK, constants.CARRY, constants.MOVE];

  for (const part of pattern) {
    const cost = PART_COST[part] ?? 0;
    if (remaining >= cost && body.length < 15) {
      body.push(part);
      remaining -= cost;
    }
  }

  while (remaining >= 200 && body.length <= 47) {
    body.push(constants.WORK, constants.CARRY, constants.MOVE);
    remaining -= 200;
  }

  return body;
}
