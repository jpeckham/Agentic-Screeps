import { describe, expect, test } from "vitest";

import { createHostileInjectionPlan } from "../../src/private-testing/hostile-injection.js";
import type { CombatScenario } from "../../src/private-testing/scenarios.js";

describe("private hostile fixture injection", () => {
  test("creates a deterministic CLI script for scenario hostiles", () => {
    const scenario: CombatScenario = {
      name: "melee-attacker",
      description: "One adjacent hostile.",
      initialState: { baseline: "owned-colony" },
      durationTicks: 12,
      hostileCreeps: [
        {
          name: "attacker-1",
          body: ["move", "attack"],
          roomName: "E1S1",
          x: 24,
          y: 25,
          action: "attackSpawn"
        }
      ],
      assertions: [{ type: "noRuntimeException", label: "bot loop runs without exception" }]
    };

    const plan = createHostileInjectionPlan({
      scenario,
      enemyUsername: "agentic-enemy",
      roomName: "E1S1"
    });

    expect(plan.name).toBe("hostile-fixtures");
    expect(plan.scenarioName).toBe("melee-attacker");
    expect(plan.hostileCreeps).toEqual([
      {
        id: "E1S1-hostile-melee-attacker-attacker-1",
        name: "attacker-1",
        body: ["move", "attack"],
        hits: 200,
        hitsMax: 200,
        roomName: "E1S1",
        x: 24,
        y: 25,
        action: "attackSpawn"
      }
    ]);
    expect(plan.cliScript).toContain("agentic-enemy");
    expect(plan.cliScript).toContain("rooms.objects");
    expect(plan.cliScript).toContain("type: 'creep'");
    expect(plan.cliScript).toContain("testAction: hostile.action");
    expect(plan.cliScript).not.toContain("SCREEPS_TOKEN");
  });

  test("rejects hostiles outside the requested room", () => {
    const scenario: CombatScenario = {
      name: "bad-room",
      description: "Mismatched room.",
      initialState: { baseline: "owned-colony" },
      durationTicks: 1,
      hostileCreeps: [
        {
          name: "attacker-1",
          body: ["move", "attack"],
          roomName: "W9N9",
          x: 24,
          y: 25
        }
      ],
      assertions: [{ type: "noRuntimeException", label: "bot loop runs without exception" }]
    };

    expect(() =>
      createHostileInjectionPlan({
        scenario,
        enemyUsername: "agentic-enemy",
        roomName: "E1S1"
      })
    ).toThrow(/must target room E1S1/);
  });

  test("caps explicit hostile hits at the generated body maximum", () => {
    const scenario: CombatScenario = {
      name: "bad-hits",
      description: "Too much health.",
      initialState: { baseline: "owned-colony" },
      durationTicks: 1,
      hostileCreeps: [
        {
          name: "attacker-1",
          body: ["move"],
          roomName: "E1S1",
          x: 24,
          y: 25,
          hits: 200
        }
      ],
      assertions: [{ type: "noRuntimeException", label: "bot loop runs without exception" }]
    };

    expect(() =>
      createHostileInjectionPlan({
        scenario,
        enemyUsername: "agentic-enemy",
        roomName: "E1S1"
      })
    ).toThrow(/hits cannot exceed hitsMax/);
  });
});
