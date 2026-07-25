import { describe, expect, test, vi } from "vitest";

import { buildWorkerBody } from "../../src/workforce/body-builder.js";
import { planWorkforce } from "../../src/workforce/workforce-planner.js";
import { runColony } from "../../src/colony/colony-controller.js";
import { createColonySnapshot } from "../../src/colony/colony-snapshot.js";
import { createInitialColonyMemory } from "../../src/colony/colony-state.js";
import { runWorker } from "../../src/creeps/creep-runner.js";
import { planConstruction } from "../../src/construction/construction-planner.js";
import { runTower } from "../../src/structures/tower-controller.js";
import { cleanupDeadCreepMemory } from "../../src/memory/creep-cleanup.js";
import { createAiConsole } from "../../src/colony/console-api.js";

const constants = {
  WORK: "work",
  CARRY: "carry",
  MOVE: "move",
  FIND_MY_STRUCTURES: 1,
  FIND_MY_CREEPS: 2,
  FIND_SOURCES: 3,
  FIND_CONSTRUCTION_SITES: 4,
  FIND_STRUCTURES: 5,
  FIND_HOSTILE_CREEPS: 6,
  STRUCTURE_SPAWN: "spawn",
  STRUCTURE_EXTENSION: "extension",
  STRUCTURE_TOWER: "tower",
  STRUCTURE_CONTAINER: "container",
  STRUCTURE_STORAGE: "storage",
  STRUCTURE_ROAD: "road",
  RESOURCE_ENERGY: "energy",
  OK: 0,
  ERR_NOT_IN_RANGE: -9
} as const;

function createRoom(options: Partial<{
  rcl: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  constructionSites: unknown[];
  creeps: unknown[];
  hostiles: unknown[];
  structures: unknown[];
  terrainWalls: string[];
}> = {}) {
  const structures = options.structures ?? [];
  const creeps = options.creeps ?? [];
  const constructionSites = options.constructionSites ?? [];
  const hostiles = options.hostiles ?? [];
  const sources = [
    { id: "source-a", pos: createPos(10, 10) },
    { id: "source-b", pos: createPos(40, 40) }
  ];
  const controller = {
    id: "controller",
    level: options.rcl ?? 1,
    ticksToDowngrade: 20000,
    my: true,
    pos: createPos(25, 25)
  };
  const room = {
    name: "W1N1",
    energyAvailable: options.energyAvailable ?? 300,
    energyCapacityAvailable: options.energyCapacityAvailable ?? 300,
    controller,
    visual: { text: vi.fn() },
    getTerrain: vi.fn(() => ({
      get: vi.fn((x: number, y: number) =>
        (options.terrainWalls ?? []).includes(`${x},${y}`) ? "wall" : "plain"
      )
    })),
    find: vi.fn((constant: number) => {
      if (constant === constants.FIND_MY_STRUCTURES) return structures;
      if (constant === constants.FIND_STRUCTURES) return structures;
      if (constant === constants.FIND_MY_CREEPS) return creeps;
      if (constant === constants.FIND_SOURCES) return sources;
      if (constant === constants.FIND_CONSTRUCTION_SITES) return constructionSites;
      if (constant === constants.FIND_HOSTILE_CREEPS) return hostiles;
      return [];
    })
  };
  return room;
}

function createPos(x: number, y: number) {
  return {
    x,
    y,
    roomName: "W1N1",
    findClosestByRange: vi.fn((items: unknown[]) => Array.isArray(items) ? items[0] : undefined),
    isNearTo: vi.fn(() => true)
  };
}

function createSpawn(energy = 300) {
  return {
    id: "spawn-1",
    name: "Spawn1",
    structureType: constants.STRUCTURE_SPAWN,
    pos: createPos(20, 20),
    spawning: null,
    store: {
      getFreeCapacity: vi.fn(() => 300 - energy),
      getUsedCapacity: vi.fn(() => energy)
    },
    spawnCreep: vi.fn(() => constants.OK)
  };
}

function createEnergyStructure(
  structureType: string,
  energy: number,
  capacity = 200
) {
  return {
    id: `${structureType}-1`,
    structureType,
    pos: createPos(21, 20),
    store: {
      getFreeCapacity: vi.fn(() => capacity - energy),
      getUsedCapacity: vi.fn(() => energy)
    }
  };
}

function createTower(energy = 900) {
  return {
    ...createEnergyStructure(constants.STRUCTURE_TOWER, energy, 1000),
    attack: vi.fn(() => constants.OK),
    heal: vi.fn(() => constants.OK),
    repair: vi.fn(() => constants.OK)
  };
}

function createWorker(name: string, energy: number, ttl = 1500) {
  const memory: Record<string, unknown> = {};
  return {
    id: name,
    name,
    ticksToLive: ttl,
    body: [{ type: constants.WORK }, { type: constants.CARRY }, { type: constants.MOVE }],
    memory,
    pos: createPos(15, 15),
    store: {
      getFreeCapacity: vi.fn(() => 50 - energy),
      getUsedCapacity: vi.fn(() => energy)
    },
    harvest: vi.fn((): number => constants.OK),
    transfer: vi.fn((): number => constants.OK),
    upgradeController: vi.fn((): number => constants.OK),
    build: vi.fn((): number => constants.OK),
    repair: vi.fn((): number => constants.OK),
    withdraw: vi.fn((): number => constants.OK),
    moveTo: vi.fn((): number => constants.OK)
  };
}

describe("worker body building", () => {
  test("builds functional bootstrap and larger balanced bodies without exceeding energy", () => {
    expect(buildWorkerBody(200, 300, constants)).toEqual(["work", "carry", "move"]);
    expect(bodyCost(buildWorkerBody(550, 550, constants))).toBeLessThanOrEqual(550);
    expect(buildWorkerBody(550, 550, constants).filter((part) => part === "move").length).toBeGreaterThanOrEqual(2);
    expect(buildWorkerBody(100, 300, constants)).toEqual([]);
  });
});

describe("workforce planning", () => {
  test("requests emergency bootstrap without waiting for max energy", () => {
    const plan = planWorkforce({
      roomName: "W1N1",
      rcl: 1,
      sourceCount: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 300,
      workerCount: 0,
      replacementCount: 0,
      expiringWorkerCount: 0,
      constructionSiteCount: 0
    });

    expect(plan.emergency).toBe(true);
    expect(plan.spawnRequest?.role).toBe("emergency-worker");
    expect(plan.spawnRequest?.body).toEqual(["work", "carry", "move"]);
  });

  test("keeps workforce bounded while replacing expiring workers", () => {
    const plan = planWorkforce({
      roomName: "W1N1",
      rcl: 3,
      sourceCount: 2,
      energyAvailable: 550,
      energyCapacityAvailable: 800,
      workerCount: 5,
      replacementCount: 1,
      expiringWorkerCount: 1,
      constructionSiteCount: 8
    });

    expect(plan.desiredWorkers).toBeLessThanOrEqual(6);
    expect(plan.spawnRequest).toBeUndefined();
  });
});

describe("colony execution", () => {
  test("fresh RCL1 room spawns, then workers harvest, refill, and upgrade", () => {
    const spawn = createSpawn(300);
    const room = createRoom({ structures: [spawn], energyAvailable: 300 });
    const memory = createInitialColonyMemory("W1N1", 1, 1);
    const game = { time: 1, rooms: { W1N1: room }, creeps: {} };

    runColony({ game, memory, constants, log: vi.fn(), cpu: { getUsed: () => 1, bucket: 10000 } });
    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      ["work", "carry", "move"],
      expect.stringMatching(/^emergency-worker-/),
      expect.objectContaining({ memory: expect.objectContaining({ colony: "W1N1" }) })
    );

    const emptyWorker = createWorker("worker-1", 0);
    const loadedWorker = createWorker("worker-2", 50);
    const needySpawn = createSpawn(0);
    const activeRoom = createRoom({ structures: [needySpawn], creeps: [emptyWorker, loadedWorker] });
    runColony({
      game: { time: 2, rooms: { W1N1: activeRoom }, creeps: { "worker-1": emptyWorker, "worker-2": loadedWorker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(emptyWorker.harvest).toHaveBeenCalled();
    expect(loadedWorker.transfer).toHaveBeenCalledWith(needySpawn, "energy");
  });

  test("upgrades when refill, build, and repair priorities are satisfied", () => {
    const worker = createWorker("worker-1", 50);
    const spawn = createSpawn(300);
    const room = createRoom({ structures: [spawn], creeps: [worker], energyAvailable: 300 });
    const memory = createInitialColonyMemory("W1N1", 1, 10);

    runColony({
      game: { time: 10, rooms: { W1N1: room }, creeps: { "worker-1": worker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
  });

  test("tags expiring worker replacements and avoids duplicate replacement spawns", () => {
    const expiring = createWorker("worker-old", 50, 100);
    const healthy = createWorker("worker-healthy", 50, 1400);
    const spawn = createSpawn(550);
    const room = createRoom({
      structures: [spawn],
      creeps: [expiring, healthy],
      energyAvailable: 550,
      energyCapacityAvailable: 550
    });
    const memory = createInitialColonyMemory("W1N1", 2, 15);

    runColony({
      game: { time: 15, rooms: { W1N1: room }, creeps: { "worker-old": expiring, "worker-healthy": healthy } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringMatching(/^worker-/),
      expect.objectContaining({
        memory: expect.objectContaining({ replacing: "worker-old" })
      })
    );

    spawn.spawnCreep.mockClear();
    const replacement = createWorker("worker-new", 0);
    replacement.memory.replacing = "worker-old";
    const replacementRoom = createRoom({
      structures: [spawn],
      creeps: [expiring, healthy, replacement],
      energyAvailable: 550,
      energyCapacityAvailable: 550
    });
    runColony({
      game: {
        time: 16,
        rooms: { W1N1: replacementRoom },
        creeps: { "worker-old": expiring, "worker-healthy": healthy, "worker-new": replacement }
      },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(spawn.spawnCreep).not.toHaveBeenCalled();
  });

  test("withdraws from containers before harvesting sources", () => {
    const worker = createWorker("worker-1", 0);
    const container = createEnergyStructure(constants.STRUCTURE_CONTAINER, 150);
    const room = createRoom({ structures: [createSpawn(), container], creeps: [worker] });
    const memory = createInitialColonyMemory("W1N1", 2, 20);

    runColony({
      game: { time: 20, rooms: { W1N1: room }, creeps: { "worker-1": worker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(worker.withdraw).toHaveBeenCalledWith(container, "energy");
    expect(worker.harvest).not.toHaveBeenCalled();
  });

  test("persists source assignments and balances workers across sources", () => {
    const first = createWorker("worker-1", 0);
    const second = createWorker("worker-2", 0);
    const room = createRoom({ structures: [createSpawn()], creeps: [first, second] });
    const snapshot = createColonySnapshot(room, constants);

    runWorker(first, snapshot, constants);
    runWorker(second, snapshot, constants);

    expect(first.memory.assignment).toEqual(expect.objectContaining({ type: "harvest", sourceId: "source-a" }));
    expect(second.memory.assignment).toEqual(expect.objectContaining({ type: "harvest", sourceId: "source-b" }));
    expect(first.harvest).toHaveBeenCalledWith(expect.objectContaining({ id: "source-a" }));
    expect(second.harvest).toHaveBeenCalledWith(expect.objectContaining({ id: "source-b" }));
  });

  test("clears invalid work assignments when targets no longer need energy", () => {
    const worker = createWorker("worker-1", 50);
    const fullSpawn = createSpawn(300);
    worker.memory.assignment = { type: "deliver", targetId: "spawn-1" };
    const room = createRoom({ structures: [fullSpawn], creeps: [worker] });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.memory.assignment).toEqual(expect.objectContaining({ type: "upgrade", targetId: "controller" }));
    expect(worker.transfer).not.toHaveBeenCalled();
    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
  });

  test("moves toward harvest, refill, and upgrade targets when out of range", () => {
    const harvester = createWorker("worker-harvest", 0);
    harvester.harvest.mockReturnValue(constants.ERR_NOT_IN_RANGE);
    const harvestRoom = createRoom({ structures: [createSpawn()], creeps: [harvester] });
    const harvestSnapshot = createColonySnapshot(harvestRoom, constants);

    runWorker(harvester, harvestSnapshot, constants);
    expect(harvester.moveTo).toHaveBeenCalledWith(expect.objectContaining({ id: "source-a" }));

    const refiller = createWorker("worker-refill", 50);
    refiller.transfer.mockReturnValue(constants.ERR_NOT_IN_RANGE);
    const needySpawn = createSpawn(0);
    const refillRoom = createRoom({ structures: [needySpawn], creeps: [refiller] });

    runWorker(refiller, createColonySnapshot(refillRoom, constants), constants);
    expect(refiller.moveTo).toHaveBeenCalledWith(needySpawn);

    const upgrader = createWorker("worker-upgrade", 50);
    upgrader.upgradeController.mockReturnValue(constants.ERR_NOT_IN_RANGE);
    const fullSpawn = createSpawn(300);
    const upgradeRoom = createRoom({ structures: [fullSpawn], creeps: [upgrader] });

    runWorker(upgrader, createColonySnapshot(upgradeRoom, constants), constants);
    expect(upgrader.moveTo).toHaveBeenCalledWith(upgradeRoom.controller);
  });

  test("visual telemetry failures do not stop creep execution", () => {
    const worker = createWorker("worker-1", 0);
    const room = createRoom({ structures: [createSpawn()], creeps: [worker] });
    room.visual.text = vi.fn(() => {
      throw new Error("visual failed");
    });
    const memory = createInitialColonyMemory("W1N1", 1, 30);

    expect(() =>
      runColony({
        game: { time: 30, rooms: { W1N1: room }, creeps: { "worker-1": worker } },
        memory,
        constants,
        log: vi.fn(),
        cpu: { getUsed: () => 1, bucket: 10000 }
      })
    ).not.toThrow();
    expect(worker.harvest).toHaveBeenCalled();
  });
});

describe("construction and tower policy", () => {
  test("plans extensions at RCL2 and tower at RCL3 incrementally without duplicates", () => {
    const rcl2Room = createRoom({ rcl: 2, structures: [createSpawn()] });
    expect(planConstruction(createColonySnapshot(rcl2Room, constants), createInitialColonyMemory("W1N1", 2, 1), constants, 1))
      .toEqual(expect.objectContaining({ structureType: "extension" }));

    const rcl3Room = createRoom({ rcl: 3, structures: [createSpawn()] });
    expect(planConstruction(createColonySnapshot(rcl3Room, constants), createInitialColonyMemory("W1N1", 3, 1), constants, 10))
      .toEqual(expect.objectContaining({ structureType: "tower" }));
  });

  test("does not place construction on duplicate occupied positions or walls", () => {
    const duplicateSite = {
      id: "site-1",
      structureType: constants.STRUCTURE_EXTENSION,
      pos: createPos(22, 20)
    };
    const duplicateRoom = createRoom({
      rcl: 2,
      structures: [createSpawn()],
      constructionSites: [duplicateSite]
    });
    const duplicatePlan = planConstruction(
      createColonySnapshot(duplicateRoom, constants),
      createInitialColonyMemory("W1N1", 2, 1),
      constants,
      1
    );

    expect(duplicatePlan).toEqual(expect.objectContaining({ structureType: "extension" }));
    expect(duplicatePlan).not.toEqual(expect.objectContaining({ x: 22, y: 20 }));

    const wallRoom = createRoom({
      rcl: 2,
      structures: [createSpawn()],
      terrainWalls: ["22,20"]
    });
    const wallPlan = planConstruction(
      createColonySnapshot(wallRoom, constants),
      createInitialColonyMemory("W1N1", 2, 1),
      constants,
      1
    );

    expect(wallPlan).toEqual(expect.objectContaining({ structureType: "extension" }));
    expect(wallPlan).not.toEqual(expect.objectContaining({ x: 22, y: 20 }));
  });

  test("plans containers and RCL4 storage after critical extension and tower demand", () => {
    const extensions = Array.from({ length: 10 }, (_, index) =>
      createEnergyStructure(constants.STRUCTURE_EXTENSION, 0, 50 + index)
    );
    const tower = createEnergyStructure(constants.STRUCTURE_TOWER, 500, 1000);
    const rcl3Room = createRoom({ rcl: 3, structures: [createSpawn(), tower, ...extensions] });
    expect(planConstruction(createColonySnapshot(rcl3Room, constants), createInitialColonyMemory("W1N1", 3, 1), constants, 1))
      .toEqual(expect.objectContaining({ structureType: "container" }));

    const containers = [
      createEnergyStructure(constants.STRUCTURE_CONTAINER, 0),
      createEnergyStructure(constants.STRUCTURE_CONTAINER, 0)
    ];
    const rcl4Room = createRoom({ rcl: 4, structures: [createSpawn(), tower, ...extensions, ...containers] });
    expect(planConstruction(createColonySnapshot(rcl4Room, constants), createInitialColonyMemory("W1N1", 4, 1), constants, 1))
      .toEqual(expect.objectContaining({ structureType: "storage" }));
  });

  test("tower attacks hostiles before healing or repairs and preserves reserve", () => {
    const hostile = { id: "hostile" };
    const tower = {
      store: { getUsedCapacity: vi.fn(() => 900) },
      attack: vi.fn(),
      heal: vi.fn(),
      repair: vi.fn()
    };

    runTower({ tower, hostiles: [hostile], injuredFriendlies: [], repairTargets: [], constants, reserve: 500 });
    expect(tower.attack).toHaveBeenCalledWith(hostile);
    expect(tower.repair).not.toHaveBeenCalled();
  });

  test("tower heals before repair and does not repair below reserve", () => {
    const injured = { id: "friendly", hits: 50, hitsMax: 100 };
    const repairTarget = { id: "road", hits: 10, hitsMax: 500 };
    const tower = {
      store: { getUsedCapacity: vi.fn(() => 900) },
      attack: vi.fn(),
      heal: vi.fn(),
      repair: vi.fn()
    };

    runTower({ tower, hostiles: [], injuredFriendlies: [injured], repairTargets: [repairTarget], constants, reserve: 500 });
    expect(tower.heal).toHaveBeenCalledWith(injured);
    expect(tower.repair).not.toHaveBeenCalled();

    tower.heal.mockClear();
    tower.store.getUsedCapacity.mockReturnValue(400);
    runTower({ tower, hostiles: [], injuredFriendlies: [], repairTargets: [repairTarget], constants, reserve: 500 });
    expect(tower.repair).not.toHaveBeenCalled();
  });

  test("colony snapshot passes injured friendly creeps to towers", () => {
    const tower = createTower();
    const injured = { ...createWorker("worker-injured", 50), hits: 40, hitsMax: 100 };
    const room = createRoom({ rcl: 3, structures: [createSpawn(), tower], creeps: [injured] });
    const memory = createInitialColonyMemory("W1N1", 3, 40);

    runColony({
      game: { time: 40, rooms: { W1N1: room }, creeps: { "worker-injured": injured } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(tower.heal).toHaveBeenCalledWith(injured);
    expect(tower.repair).not.toHaveBeenCalled();
  });
});

describe("memory, console API, and observability", () => {
  test("cleans only dead creep memory and keeps unrelated memory", () => {
    const memory = {
      creeps: {
        alive: { role: "worker" },
        dead: { role: "worker" }
      },
      unrelated: { keep: true }
    };

    cleanupDeadCreepMemory(memory, { alive: {} });

    expect(memory.creeps).toEqual({ alive: { role: "worker" } });
    expect(memory.unrelated).toEqual({ keep: true });
  });

  test("safe console API reports status and toggles visuals without reset commands", () => {
    const memory = { colonies: { W1N1: createInitialColonyMemory("W1N1", 2, 1) }, config: { visualsEnabled: true } };
    const ai = createAiConsole(memory);

    expect(ai.status("W1N1")).toEqual(expect.objectContaining({ roomName: "W1N1" }));
    ai.setVisuals(false);
    ai.forceReplan("W1N1");

    expect(memory.config.visualsEnabled).toBe(false);
    expect(memory.colonies.W1N1.forceReplan).toBe(true);
    expect("reset" in ai).toBe(false);
  });
});

function bodyCost(body: string[]): number {
  return body.reduce((total, part) => total + (part === "work" ? 100 : part === "carry" ? 50 : 50), 0);
}
