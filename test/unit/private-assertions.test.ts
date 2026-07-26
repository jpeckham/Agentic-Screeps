import { describe, expect, test } from "vitest";

import {
  evaluateAssertions,
  type ScenarioAssertion,
  type ScenarioObservation
} from "../../src/private-testing/assertions.js";

const observations: ScenarioObservation[] = [
  {
    tick: 100,
    state: {
      threat: "NONE",
      posture: "PEACE",
      hostile: { exists: false, hits: 100 },
      tower: { action: "idle" }
    },
    runtimeExceptions: []
  },
  {
    tick: 101,
    state: {
      threat: "MEDIUM",
      posture: "ENGAGE",
      hostile: { exists: true, hits: 80 },
      tower: { action: "attack" }
    },
    runtimeExceptions: []
  },
  {
    tick: 102,
    state: {
      threat: "MEDIUM",
      posture: "ENGAGE",
      hostile: { exists: true, hits: 40 },
      tower: { action: "attack" }
    },
    runtimeExceptions: []
  }
];

describe("private scenario assertion engine", () => {
  test("passes supported assertion categories against ordered observations", () => {
    const assertions: ScenarioAssertion[] = [
      { type: "equals", label: "tower attacks", path: "tower.action", expected: "attack" },
      { type: "oneOf", label: "threat is combat", path: "threat", expected: ["MEDIUM", "HIGH"] },
      { type: "everEquals", label: "tower attacked at least once", path: "tower.action", expected: "attack" },
      { type: "everOneOf", label: "threat was combat", path: "threat", expected: ["MEDIUM", "HIGH"] },
      { type: "becomesTrueWithin", label: "hostile appears", path: "hostile.exists", ticks: 2 },
      { type: "remainsUnchanged", label: "posture remains engaged", path: "posture", ticks: 2 },
      { type: "exists", label: "hostile hits observed", path: "hostile.hits" },
      { type: "notExists", label: "no selected target before baseline", path: "selectedTargetId" },
      { type: "hitPointsDecreased", label: "hostile takes damage", path: "hostile.hits" },
      {
        type: "postureTransition",
        label: "peace to engage",
        path: "posture",
        from: "PEACE",
        to: "ENGAGE",
        withinTicks: 2
      },
      { type: "noRuntimeException", label: "loop stayed healthy" }
    ];

    const results = evaluateAssertions(assertions, observations);

    expect(results.every((result) => result.status === "pass")).toBe(true);
    expect(results.map((result) => result.label)).toEqual(assertions.map((assertion) => assertion.label));
  });

  test("reports actual value and observed tick for failures", () => {
    const result = evaluateAssertions(
      [{ type: "equals", label: "tower heals", path: "tower.action", expected: "heal" }],
      observations
    )[0]!;

    expect(result).toEqual({
      status: "fail",
      label: "tower heals",
      message: "expected heal, actual attack",
      expected: "heal",
      actual: "attack",
      observedTick: 102
    });
  });

  test("fails noRuntimeException when any observation records an exception", () => {
    const result = evaluateAssertions(
      [{ type: "noRuntimeException", label: "loop stayed healthy" }],
      [
        observations[0]!,
        { tick: 101, state: {}, runtimeExceptions: ["boom"] }
      ]
    )[0]!;

    expect(result.status).toBe("fail");
    expect(result.message).toContain("boom");
    expect(result.observedTick).toBe(101);
  });

  test("treats a previously observed missing hit point path as defeated", () => {
    const result = evaluateAssertions(
      [{ type: "hitPointsDecreased", label: "hostile takes damage", path: "hostiles.attacker-1.hits" }],
      [
        { tick: 1, state: { hostiles: { "attacker-1": { hits: 200 } } }, runtimeExceptions: [] },
        { tick: 2, state: { hostiles: {} }, runtimeExceptions: [] }
      ]
    )[0]!;

    expect(result).toEqual({
      status: "pass",
      label: "hostile takes damage",
      observedTick: 2
    });
  });
});
