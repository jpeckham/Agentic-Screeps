import { describe, expect, test } from "vitest";

import { createWorldResetPlan } from "../../src/private-testing/world-reset.js";
import {
  createOwnedColonySeedPlan,
  validateWorldSeedPlan
} from "../../src/private-testing/world-seeder.js";

describe("private world reset and seeding", () => {
  test("creates a destructive reset plan scoped to private testing collections", () => {
    const plan = createWorldResetPlan({
      botUsername: "agentic-bot",
      enemyUsername: "agentic-enemy",
      roomName: "E1S1"
    });

    expect(plan.name).toBe("reset-private-test-world");
    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      "removeCreeps",
      "removeStructures",
      "removeConstructionSites",
      "removeFlags",
      "removeRoomObjects",
      "clearMemory",
      "ensureUsers"
    ]);
    expect(plan.cliScript).toContain("agentic-bot");
    expect(plan.cliScript).toContain("agentic-enemy");
    expect(plan.cliScript).not.toContain("SCREEPS_TOKEN");
  });

  test("creates a deterministic owned RCL3 colony seed with tower, extensions, and source containers", () => {
    const plan = createOwnedColonySeedPlan({
      username: "agentic-bot",
      roomName: "E1S1"
    });

    expect(plan.roomName).toBe("E1S1");
    expect(plan.controller.level).toBe(3);
    expect(plan.structures.map((structure) => structure.type)).toEqual([
      "spawn",
      "tower",
      "extension",
      "extension",
      "extension",
      "extension",
      "extension",
      "container",
      "container"
    ]);
    expect(plan.sources).toHaveLength(2);
    expect(plan.structures.filter((structure) => structure.type === "container")).toEqual([
      expect.objectContaining({ id: "E1S1-container-source-1", x: 19, y: 22 }),
      expect.objectContaining({ id: "E1S1-container-source-2", x: 33, y: 28 })
    ]);
    expect(plan.storage.energyAvailable).toBe(800);
    expect(plan.cliScript).toContain("StructureSpawn");
    expect(plan.cliScript).toContain("StructureTower");
    expect(plan.cliScript).toContain("StructureContainer");
  });

  test("validates deterministic seed coordinates and duplicate object ids", () => {
    const plan = createOwnedColonySeedPlan({
      username: "agentic-bot",
      roomName: "E1S1"
    });

    expect(() => validateWorldSeedPlan(plan)).not.toThrow();

    expect(() =>
      validateWorldSeedPlan({
        ...plan,
        structures: [
          ...plan.structures,
          { ...plan.structures[0]!, x: 99 }
        ]
      })
    ).toThrow(/coordinate|duplicate/);
  });
});
