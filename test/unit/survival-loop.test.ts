import { describe, expect, test, vi } from "vitest";

import { runSurvivalLoop } from "../../src/survival/survival-loop.js";
import { createScreepsSurvivalHooks } from "../../src/survival/screeps-adapter.js";

describe("survival loop", () => {
  test("runs only critical operations and skips strategic/offensive hooks", () => {
    const towerDefense = vi.fn();
    const spawnEmergencyHarvester = vi.fn();
    const upgradeController = vi.fn();
    const strategicPlanning = vi.fn();
    const offensiveOperations = vi.fn();

    runSurvivalLoop({
      towers: [{ runDefense: towerDefense }],
      viableHarvesters: 0,
      spawns: [{ spawnEmergencyHarvester }],
      controllers: [{ preventDowngrade: upgradeController }],
      strategicPlanning,
      offensiveOperations
    });

    expect(towerDefense).toHaveBeenCalledOnce();
    expect(spawnEmergencyHarvester).toHaveBeenCalledOnce();
    expect(upgradeController).toHaveBeenCalledOnce();
    expect(strategicPlanning).not.toHaveBeenCalled();
    expect(offensiveOperations).not.toHaveBeenCalled();
  });
});

describe("Screeps survival adapter", () => {
  test("adapts towers and emergency creeps from globals", () => {
    const constants = {
      FIND_MY_STRUCTURES: 1,
      FIND_MY_CREEPS: 2,
      FIND_HOSTILE_CREEPS: 3,
      FIND_SOURCES_ACTIVE: 4,
      STRUCTURE_TOWER: "tower",
      STRUCTURE_SPAWN: "spawn",
      WORK: "work",
      CARRY: "carry",
      MOVE: "move",
      ERR_NOT_IN_RANGE: -9,
      RESOURCE_ENERGY: "energy"
    } as const;
    const hostile = { id: "hostile" };
    const source = { id: "source" };
    const controller = { id: "controller" };
    const tower = {
      pos: { findClosestByRange: vi.fn().mockReturnValue(hostile) },
      attack: vi.fn()
    };
    const spawn = {
      name: "Spawn1",
      spawning: null,
      room: { energyAvailable: 300 },
      spawnCreep: vi.fn()
    };
    const creep = {
      memory: { role: "emergencyHarvester" },
      store: { getFreeCapacity: vi.fn().mockReturnValue(10), getUsedCapacity: vi.fn() },
      pos: { findClosestByRange: vi.fn().mockReturnValue(source) },
      harvest: vi.fn(),
      transfer: vi.fn(),
      upgradeController: vi.fn()
    };
    const room = {
      controller,
      find: vi.fn().mockImplementation((constant: number) => {
        if (constant === constants.FIND_MY_STRUCTURES) return [tower, spawn];
        if (constant === constants.FIND_MY_CREEPS) return [creep];
        return [];
      })
    };

    const hooks = createScreepsSurvivalHooks({
      Game: { rooms: { W1N1: room }, time: 123 },
      constants: {
        FIND_MY_STRUCTURES: constants.FIND_MY_STRUCTURES,
        FIND_MY_CREEPS: constants.FIND_MY_CREEPS,
        FIND_HOSTILE_CREEPS: constants.FIND_HOSTILE_CREEPS,
        FIND_SOURCES_ACTIVE: constants.FIND_SOURCES_ACTIVE,
        STRUCTURE_TOWER: constants.STRUCTURE_TOWER,
        STRUCTURE_SPAWN: constants.STRUCTURE_SPAWN,
        WORK: constants.WORK,
        CARRY: constants.CARRY,
        MOVE: constants.MOVE,
        ERR_NOT_IN_RANGE: constants.ERR_NOT_IN_RANGE,
        RESOURCE_ENERGY: constants.RESOURCE_ENERGY
      }
    });

    runSurvivalLoop(hooks);

    expect(tower.attack).toHaveBeenCalledWith(hostile);
    expect(spawn.spawnCreep).not.toHaveBeenCalled();
    expect(creep.harvest).toHaveBeenCalledWith(source);
  });

  test("spawns an emergency harvester when none are viable", () => {
    const constants = {
      FIND_MY_STRUCTURES: 1,
      FIND_MY_CREEPS: 2,
      FIND_HOSTILE_CREEPS: 3,
      FIND_SOURCES_ACTIVE: 4,
      STRUCTURE_TOWER: "tower",
      STRUCTURE_SPAWN: "spawn",
      WORK: "work",
      CARRY: "carry",
      MOVE: "move",
      ERR_NOT_IN_RANGE: -9,
      RESOURCE_ENERGY: "energy"
    } as const;
    const spawn = {
      name: "Spawn1",
      spawning: null,
      room: { energyAvailable: 300 },
      spawnCreep: vi.fn()
    };
    const room = {
      find: vi.fn().mockImplementation((constant: number) => {
        if (constant === constants.FIND_MY_STRUCTURES) return [spawn];
        return [];
      })
    };

    const hooks = createScreepsSurvivalHooks({
      Game: { rooms: { W1N1: room }, time: 123 },
      constants
    });

    runSurvivalLoop(hooks);

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      [constants.WORK, constants.CARRY, constants.MOVE],
      "emergency-123-Spawn1",
      { memory: { role: "emergencyHarvester" } }
    );
  });
});
