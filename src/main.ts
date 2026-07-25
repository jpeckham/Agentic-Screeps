import { migrateMemory } from "./memory/migrations.js";
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
  migrateMemory(Memory as unknown as Record<string, unknown>);
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
