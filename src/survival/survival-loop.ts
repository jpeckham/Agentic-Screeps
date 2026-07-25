export interface SurvivalTower {
  runDefense(): void;
}

export interface SurvivalSpawn {
  spawnEmergencyHarvester(): void;
}

export interface SurvivalController {
  preventDowngrade(): void;
}

export interface SurvivalEmergencyCreep {
  runEmergencyWork(): void;
}

export interface SurvivalHooks {
  towers?: SurvivalTower[];
  viableHarvesters: number;
  spawns?: SurvivalSpawn[];
  controllers?: SurvivalController[];
  emergencyCreeps?: SurvivalEmergencyCreep[];
  strategicPlanning?: () => void;
  offensiveOperations?: () => void;
}

export function runSurvivalLoop(hooks: SurvivalHooks): void {
  for (const tower of hooks.towers ?? []) {
    tower.runDefense();
  }

  if (hooks.viableHarvesters === 0) {
    for (const spawn of hooks.spawns ?? []) {
      spawn.spawnEmergencyHarvester();
    }
  }

  for (const controller of hooks.controllers ?? []) {
    controller.preventDowngrade();
  }

  for (const creep of hooks.emergencyCreeps ?? []) {
    creep.runEmergencyWork();
  }
}
