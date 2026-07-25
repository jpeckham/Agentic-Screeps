import { describe, expect, test, vi } from "vitest";

import { runSafely } from "../../src/runtime/error-boundary.js";
import {
  beginTick,
  createInitialReleaseState,
  endTick,
  recordHealthyTick,
  recordTopLevelFailure
} from "../../src/runtime/release-state.js";
import { createLoop } from "../../src/main.js";

describe("runtime safety", () => {
  test("normal loop records healthy ticks", () => {
    const memory = { runtime: createInitialReleaseState("release-a", 100) };
    const runSurvivalLoop = vi.fn();
    const loop = createLoop({
      memory,
      getTick: () => 101,
      runNormalEmpireLoop: vi.fn(),
      runSurvivalLoop,
      log: vi.fn()
    });

    loop();

    expect(memory.runtime.lastHealthyTick).toBe(101);
    expect(memory.runtime.healthyTicks).toBe(1);
    expect(memory.runtime.consecutiveTopLevelFailures).toBe(0);
    expect(runSurvivalLoop).not.toHaveBeenCalled();
  });

  test("top-level failure invokes survival loop and repeated failures enable degraded mode", () => {
    const memory = { runtime: createInitialReleaseState("release-a", 100) };
    const loop = createLoop({
      memory,
      getTick: () => 101,
      runNormalEmpireLoop: vi.fn(() => {
        throw new Error("boom");
      }),
      runSurvivalLoop: vi.fn(),
      log: vi.fn(),
      config: { degradedAfterFailures: 2, recoverAfterHealthyTicks: 2 }
    });

    loop();
    loop();

    expect(memory.runtime.consecutiveTopLevelFailures).toBe(2);
    expect(memory.runtime.degradedMode).toBe(true);
  });

  test("healthy ticks eventually clear degraded mode", () => {
    const state = createInitialReleaseState("release-a", 100);
    recordTopLevelFailure(state, { tick: 101, error: new Error("one"), threshold: 1 });
    expect(state.degradedMode).toBe(true);

    recordHealthyTick(state, { tick: 102, recoverAfterHealthyTicks: 2 });
    recordHealthyTick(state, { tick: 103, recoverAfterHealthyTicks: 2 });

    expect(state.degradedMode).toBe(false);
  });

  test("one subsystem failure does not stop unrelated subsystems and history is bounded", () => {
    const state = createInitialReleaseState("release-a", 100);
    const first = vi.fn(() => {
      throw new Error("bad subsystem");
    });
    const second = vi.fn();

    runSafely(state, "first", first, { tick: 101, maxHistory: 1 });
    runSafely(state, "second", second, { tick: 101, maxHistory: 1 });
    runSafely(state, "first", first, { tick: 102, maxHistory: 1 });

    expect(second).toHaveBeenCalledOnce();
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]?.subsystem).toBe("first");
  });

  test("new release detection resets appropriate counters", () => {
    const state = createInitialReleaseState("release-a", 100);
    recordTopLevelFailure(state, { tick: 101, error: new Error("fail"), threshold: 1 });

    beginTick(state, { version: "release-b", tick: 200 });
    endTick();

    expect(state.version).toBe("release-b");
    expect(state.activatedAt).toBe(200);
    expect(state.consecutiveTopLevelFailures).toBe(0);
    expect(state.degradedMode).toBe(false);
  });
});
