import { describe, expect, test } from "vitest";

import { collectTestingObservationsFromMemory } from "../../src/private-testing/state-collector.js";

describe("private testing state collector", () => {
  test("converts Memory.testing colony data into scenario observations", () => {
    const observations = collectTestingObservationsFromMemory({
      testing: {
        tick: 500,
        colonies: {
          E1S1: {
            threat: "MEDIUM",
            posture: "ENGAGE",
            hostileCount: 1,
            selectedTargetId: "attacker-1",
            tower: { action: "attack" }
          }
        }
      }
    }, "E1S1");

    expect(observations).toEqual([
      {
        tick: 500,
        state: {
          threat: "MEDIUM",
          posture: "ENGAGE",
          hostileCount: 1,
          selectedTargetId: "attacker-1",
          tower: { action: "attack" }
        },
        runtimeExceptions: []
      }
    ]);
  });

  test("records runtime exceptions from runtime failure memory", () => {
    const observations = collectTestingObservationsFromMemory({
      runtime: {
        topLevelFailures: [
          { tick: 499, message: "first" },
          { tick: 500, message: "boom" }
        ]
      },
      testing: {
        tick: 500,
        colonies: { E1S1: { threat: "NONE", posture: "PEACE" } }
      }
    }, "E1S1");

    expect(observations[0]?.runtimeExceptions).toEqual(["first", "boom"]);
  });

  test("returns an empty observation set when the requested colony has no testing data", () => {
    expect(collectTestingObservationsFromMemory({ testing: { tick: 1, colonies: {} } }, "E1S1")).toEqual([]);
  });
});
