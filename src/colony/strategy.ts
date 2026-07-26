import type { ColonySnapshot } from "./colony-snapshot.js";

export type ColonyStrategyName =
  | "emergency-recovery"
  | "bootstrap"
  | "balanced-early"
  | "infrastructure-push"
  | "controller-recovery"
  | "defensive-rcl3"
  | "early-rcl4";

export type ConstructionKind = "tower" | "extension" | "storage" | "container";

export interface WorkforceStrategy {
  minWorkers: number;
  maxWorkers: number;
  constructionSiteBonusThreshold: number;
  constructionWorkerBonus: number;
}

export interface WorkerStrategy {
  maxExtensionBuilders: number;
  maxTowerBuilders: number;
  controllerEmergencyThreshold: number;
  towerEnergyReserve: number;
}

export interface ConstructionStrategy {
  priority: ConstructionKind[];
  extensionTargets: {
    rcl2: number;
    rcl3: number;
    rcl4: number;
  };
}

export interface ColonyStrategy {
  name: ColonyStrategyName;
  workforce: WorkforceStrategy;
  worker: WorkerStrategy;
  construction: ConstructionStrategy;
}

export interface StrategySelectionOptions {
  controllerEmergencyThreshold?: number;
  towerEnergyReserve?: number;
}

const DEFAULT_CONTROLLER_THRESHOLD = 4000;
const DEFAULT_TOWER_RESERVE = 500;

export function selectColonyStrategy(
  snapshot: ColonySnapshot,
  options: StrategySelectionOptions = {}
): ColonyStrategy {
  const controllerThreshold = options.controllerEmergencyThreshold ?? DEFAULT_CONTROLLER_THRESHOLD;
  const towerReserve = options.towerEnergyReserve ?? DEFAULT_TOWER_RESERVE;

  if (snapshot.workers.length === 0) return strategy("emergency-recovery", controllerThreshold, towerReserve);
  if ((snapshot.controller?.ticksToDowngrade ?? Number.POSITIVE_INFINITY) < controllerThreshold) {
    return strategy("controller-recovery", controllerThreshold, towerReserve);
  }
  if (snapshot.rcl <= 1) return strategy("bootstrap", controllerThreshold, towerReserve);
  if (snapshot.rcl >= 4) return strategy("early-rcl4", controllerThreshold, towerReserve);
  if (snapshot.rcl >= 3 && snapshot.towers.length === 0) return strategy("defensive-rcl3", controllerThreshold, towerReserve);
  if (
    snapshot.rcl === 2 &&
    snapshot.constructionSites.filter((site) => site.structureType === "extension").length >= 4
  ) {
    return strategy("infrastructure-push", controllerThreshold, towerReserve);
  }
  return strategy("balanced-early", controllerThreshold, towerReserve);
}

function strategy(
  name: ColonyStrategyName,
  controllerEmergencyThreshold: number,
  towerEnergyReserve: number
): ColonyStrategy {
  const baseWorker = {
    controllerEmergencyThreshold,
    towerEnergyReserve,
    maxExtensionBuilders: 3,
    maxTowerBuilders: 3
  };
  const earlyConstruction: ConstructionStrategy = {
    priority: ["tower", "extension", "storage", "container"],
    extensionTargets: { rcl2: 5, rcl3: 10, rcl4: 20 }
  };

  switch (name) {
    case "emergency-recovery":
      return {
        name,
        workforce: { minWorkers: 1, maxWorkers: 3, constructionSiteBonusThreshold: 99, constructionWorkerBonus: 0 },
        worker: { ...baseWorker, maxExtensionBuilders: 1, maxTowerBuilders: 1 },
        construction: earlyConstruction
      };
    case "bootstrap":
      return {
        name,
        workforce: { minWorkers: 3, maxWorkers: 3, constructionSiteBonusThreshold: 99, constructionWorkerBonus: 0 },
        worker: { ...baseWorker, maxExtensionBuilders: 1 },
        construction: earlyConstruction
      };
    case "infrastructure-push":
      return {
        name,
        workforce: { minWorkers: 4, maxWorkers: 5, constructionSiteBonusThreshold: 2, constructionWorkerBonus: 1 },
        worker: { ...baseWorker, maxExtensionBuilders: 3 },
        construction: earlyConstruction
      };
    case "controller-recovery":
      return {
        name,
        workforce: { minWorkers: 4, maxWorkers: 5, constructionSiteBonusThreshold: 99, constructionWorkerBonus: 0 },
        worker: { ...baseWorker, maxExtensionBuilders: 1, maxTowerBuilders: 1 },
        construction: earlyConstruction
      };
    case "defensive-rcl3":
      return {
        name,
        workforce: { minWorkers: 5, maxWorkers: 6, constructionSiteBonusThreshold: 1, constructionWorkerBonus: 1 },
        worker: { ...baseWorker, maxExtensionBuilders: 2, maxTowerBuilders: 3 },
        construction: earlyConstruction
      };
    case "early-rcl4":
      return {
        name,
        workforce: { minWorkers: 6, maxWorkers: 6, constructionSiteBonusThreshold: 2, constructionWorkerBonus: 1 },
        worker: { ...baseWorker, maxExtensionBuilders: 2, maxTowerBuilders: 2 },
        construction: earlyConstruction
      };
    case "balanced-early":
      return {
        name,
        workforce: { minWorkers: 4, maxWorkers: 5, constructionSiteBonusThreshold: 4, constructionWorkerBonus: 1 },
        worker: baseWorker,
        construction: earlyConstruction
      };
  }
}
