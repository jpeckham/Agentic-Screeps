export interface ColonyConfig {
  visualsEnabled: boolean;
  statusLogInterval: number;
  emergencyTtlThreshold: number;
  replacementTtlThreshold: number;
  towerEnergyReserve: number;
  repairThreshold: number;
  roadRepairThreshold: number;
  wallStarterThreshold: number;
  controllerEmergencyThreshold: number;
  planningCadence: number;
  lowCpuBucket: number;
}

export const DEFAULT_COLONY_CONFIG: ColonyConfig = {
  visualsEnabled: true,
  statusLogInterval: 100,
  emergencyTtlThreshold: 80,
  replacementTtlThreshold: 180,
  towerEnergyReserve: 500,
  repairThreshold: 0.5,
  roadRepairThreshold: 0.35,
  wallStarterThreshold: 10000,
  controllerEmergencyThreshold: 4000,
  planningCadence: 50,
  lowCpuBucket: 2000
};

export function mergeColonyConfig(config?: Partial<ColonyConfig>): ColonyConfig {
  return { ...DEFAULT_COLONY_CONFIG, ...config };
}
