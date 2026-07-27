import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  loadScenarioDefinitions,
  validateScenarioDefinition
} from "../../src/private-testing/scenarios.js";

describe("private scenario definitions", () => {
  test("loads JSON definitions in deterministic name order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "private-scenarios-"));
    try {
      await writeFile(join(dir, "b.json"), JSON.stringify(validScenario("zeta")));
      await writeFile(join(dir, "a.json"), JSON.stringify(validScenario("alpha")));

      const scenarios = await loadScenarioDefinitions(dir);

      expect(scenarios.map((scenario) => scenario.name)).toEqual(["alpha", "zeta"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects invalid hostile body parts, actions, coordinates, and durations", () => {
    expect(() =>
      validateScenarioDefinition({
        ...(validScenario("bad") as Record<string, unknown>),
        durationTicks: 0,
        hostileCreeps: [
          {
            name: "",
            body: ["fly"],
            roomName: "E1S1",
            x: 99,
            y: -1,
            action: "dance"
          }
        ]
      })
    ).toThrow(/durationTicks|hostileCreeps/);
  });

  test("loads committed baseline combat scenario definitions", async () => {
    const scenarios = await loadScenarioDefinitions("test/scenarios/definitions");

    expect(scenarios.map((scenario) => scenario.name)).toEqual([
      "critical-hauler-loss",
      "critical-hauler-loss-control",
      "healer-and-attacker",
      "melee-attacker",
      "no-hostile-baseline",
      "threat-disappears",
      "unarmed-scout"
    ]);
    expect(scenarios.find((scenario) => scenario.name === "melee-attacker")?.hostileCreeps).toEqual([
      expect.objectContaining({
        name: "attacker-1",
        body: ["tough", "tough", "tough", "tough", "tough", "move", "attack"],
        action: "attackSpawn"
      })
    ]);
  });
});

function validScenario(name: string): unknown {
  return {
    name,
    description: `${name} scenario`,
    initialState: { baseline: "owned-colony" },
    durationTicks: 5,
    hostileCreeps: [
      {
        name: "hostile-1",
        body: ["move"],
        roomName: "E1S1",
        x: 25,
        y: 25,
        action: "hold"
      }
    ],
    assertions: [
      {
        type: "noRuntimeException",
        label: "loop stayed healthy"
      }
    ]
  };
}
