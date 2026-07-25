import { migrateMemory } from "./memory/migrations.js";
import { cleanupDeadCreepMemory } from "./memory/creep-cleanup.js";
import {
  beginTick,
  createInitialReleaseState,
  endTick,
  recordHealthyTick,
  recordTopLevelFailure,
  type RootRuntimeMemory
} from "./runtime/release-state.js";
import { BUILD_INFO } from "./runtime/build-info.js";
import { runSurvivalLoop as runDefaultSurvivalLoop } from "./survival/survival-loop.js";
import { createDefaultScreepsSurvivalHooks } from "./survival/screeps-adapter.js";
import { runOwnedColonies } from "./colony/colony-controller.js";
import { createAiConsole } from "./colony/console-api.js";
import type { RootMemory } from "./memory/schema.js";

export interface LoopDependencies {
  memory: Partial<RootRuntimeMemory>;
  getTick: () => number;
  runNormalEmpireLoop: () => void;
  runSurvivalLoop: () => void;
  log: (message: string) => void;
  config?: {
    degradedAfterFailures?: number;
    recoverAfterHealthyTicks?: number;
  };
}

export function createLoop(dependencies: LoopDependencies): () => void {
  return () => {
    const tick = dependencies.getTick();
    dependencies.memory.runtime ??= createInitialReleaseState(BUILD_INFO.releaseId, tick);
    beginTick(dependencies.memory.runtime, { version: BUILD_INFO.releaseId, tick });

    try {
      dependencies.runNormalEmpireLoop();
      recordHealthyTick(dependencies.memory.runtime, {
        tick,
        ...(dependencies.config?.recoverAfterHealthyTicks
          ? { recoverAfterHealthyTicks: dependencies.config.recoverAfterHealthyTicks }
          : {})
      });
    } catch (error) {
      recordTopLevelFailure(dependencies.memory.runtime, {
        tick,
        error,
        ...(dependencies.config?.degradedAfterFailures
          ? { threshold: dependencies.config.degradedAfterFailures }
          : {})
      });
      dependencies.log(
        `Runtime failure in ${BUILD_INFO.releaseId} at tick ${tick}; entering survival loop.`
      );
      dependencies.runSurvivalLoop();
    } finally {
      endTick();
    }
  };
}

function runNormalEmpireLoop(): void {
  const rootMemory = Memory as unknown as RootMemory;
  migrateMemory(rootMemory as unknown as Record<string, unknown>);
  if (rootMemory.data["lastReleaseLogged"] !== BUILD_INFO.releaseId) {
    console.log(`[release ${BUILD_INFO.shortGitSha}] activated`);
    rootMemory.data["lastReleaseLogged"] = BUILD_INFO.releaseId;
  }
  cleanupDeadCreepMemory(rootMemory, Game.creeps as unknown as Record<string, unknown>);
  (globalThis as unknown as { ai: unknown }).ai = createAiConsole(rootMemory);
  runOwnedColonies({
    game: Game,
    memory: rootMemory,
    constants: {
      WORK,
      CARRY,
      MOVE,
      FIND_MY_STRUCTURES,
      FIND_STRUCTURES,
      FIND_MY_CREEPS,
      FIND_SOURCES,
      FIND_CONSTRUCTION_SITES,
      FIND_HOSTILE_CREEPS,
      STRUCTURE_SPAWN,
      STRUCTURE_EXTENSION,
      STRUCTURE_TOWER,
      STRUCTURE_CONTAINER,
      STRUCTURE_STORAGE,
      STRUCTURE_ROAD,
      RESOURCE_ENERGY,
      OK,
      ERR_NOT_IN_RANGE
    },
    log: (message: string) => console.log(message),
    cpu: Game.cpu
  });
}

export function loop(): void {
  createLoop({
    memory: Memory as unknown as Partial<RootRuntimeMemory>,
    getTick: () => Game.time,
    runNormalEmpireLoop,
    runSurvivalLoop: () => runDefaultSurvivalLoop(createDefaultScreepsSurvivalHooks()),
    log: (message: string) => console.log(message)
  })();
}
