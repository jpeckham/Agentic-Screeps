import { describe, expect, test, vi } from "vitest";

import { buildWorkerBody } from "../../src/workforce/body-builder.js";
import { planWorkforce } from "../../src/workforce/workforce-planner.js";
import { runColony, runOwnedColonies } from "../../src/colony/colony-controller.js";
import { createColonySnapshot } from "../../src/colony/colony-snapshot.js";
import { createInitialColonyMemory } from "../../src/colony/colony-state.js";
import { selectColonyStrategy } from "../../src/colony/strategy.js";
import { runWorker } from "../../src/creeps/creep-runner.js";
import { planConstruction } from "../../src/construction/construction-planner.js";
import { runTower } from "../../src/structures/tower-controller.js";
import { cleanupDeadCreepMemory } from "../../src/memory/creep-cleanup.js";
import { createAiConsole } from "../../src/colony/console-api.js";
import { drawRoomStatusVisual } from "../../src/visualization/room-status-visual.js";

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
  sources: unknown[];
  structures: unknown[];
  terrainWalls: string[];
}> = {}) {
  const structures = options.structures ?? [];
  const creeps = options.creeps ?? [];
  const constructionSites = options.constructionSites ?? [];
  const hostiles = options.hostiles ?? [];
  const sources = options.sources ?? [
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
    expect(buildWorkerBody(300, 300, constants).filter((part) => part === "move").length).toBeGreaterThanOrEqual(2);
    expect(buildWorkerBody(350, 350, constants)).toEqual(["work", "carry", "move", "carry", "move"]);
    expect(buildWorkerBody(400, 400, constants)).toEqual(["work", "carry", "move", "work", "carry", "move"]);
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

describe("colony strategy selection", () => {
  test("selects explicit strategies from room context", () => {
    const worker = createWorker("worker-1", 0);

    expect(selectColonyStrategy(createColonySnapshot(createRoom({ creeps: [] }), constants)).name)
      .toBe("emergency-recovery");

    expect(selectColonyStrategy(createColonySnapshot(createRoom({ rcl: 1, creeps: [worker] }), constants)).name)
      .toBe("bootstrap");

    const extensionSites = Array.from({ length: 4 }, (_, index) => ({
      id: `extension-site-${index}`,
      structureType: constants.STRUCTURE_EXTENSION,
      pos: createPos(22 + index, 20)
    }));
    expect(selectColonyStrategy(createColonySnapshot(createRoom({
      rcl: 2,
      creeps: [worker],
      constructionSites: extensionSites
    }), constants)).name).toBe("infrastructure-push");

    const controllerRiskRoom = createRoom({ rcl: 2, creeps: [worker], constructionSites: extensionSites });
    controllerRiskRoom.controller.ticksToDowngrade = 3000;
    expect(selectColonyStrategy(createColonySnapshot(controllerRiskRoom, constants)).name)
      .toBe("controller-recovery");

    expect(selectColonyStrategy(createColonySnapshot(createRoom({ rcl: 3, creeps: [worker] }), constants)).name)
      .toBe("defensive-rcl3");

    expect(selectColonyStrategy(createColonySnapshot(createRoom({ rcl: 4, creeps: [worker] }), constants)).name)
      .toBe("early-rcl4");
  });

  test("logs strategy changes and applies strategy workforce policy", () => {
    const log = vi.fn();
    const workers = [
      createWorker("worker-1", 50),
      createWorker("worker-2", 50),
      createWorker("worker-3", 0),
      createWorker("worker-4", 0)
    ];
    const extensionSites = Array.from({ length: 4 }, (_, index) => ({
      id: `extension-site-${index}`,
      structureType: constants.STRUCTURE_EXTENSION,
      pos: createPos(22 + index, 20)
    }));
    const spawn = createSpawn(550);
    const room = createRoom({
      rcl: 2,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      structures: [spawn],
      creeps: workers,
      constructionSites: extensionSites
    });
    const memory = createInitialColonyMemory("W1N1", 2, 1);
    memory.workforceTarget = 4;

    runColony({
      game: { time: 50, rooms: { W1N1: room }, creeps: Object.fromEntries(workers.map((worker) => [worker.name, worker])) },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { planningCadence: 100 }
    });

    expect(log).toHaveBeenCalledWith("[colony W1N1] strategy selected: infrastructure-push");
    expect(log).toHaveBeenCalledWith("[colony W1N1] workforce target changed: 4 -> 5");
    expect(memory.strategy).toBe("infrastructure-push");
    expect(spawn.spawnCreep).toHaveBeenCalled();
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

  test("logs workforce target changes once", () => {
    const workers = [
      createWorker("worker-1", 0),
      createWorker("worker-2", 0),
      createWorker("worker-3", 0),
      createWorker("worker-4", 0)
    ];
    const room = createRoom({ rcl: 2, structures: [createSpawn(300)], creeps: workers });
    const memory = createInitialColonyMemory("W1N1", 2, 11);
    memory.workforceTarget = 3;
    const log = vi.fn();

    runColony({
      game: {
        time: 11,
        rooms: { W1N1: room },
        creeps: Object.fromEntries(workers.map((worker) => [worker.name, worker]))
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(log).toHaveBeenCalledWith("[colony W1N1] workforce target changed: 3 -> 4");

    log.mockClear();
    runColony({
      game: {
        time: 12,
        rooms: { W1N1: room },
        creeps: Object.fromEntries(workers.map((worker) => [worker.name, worker]))
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("workforce target changed"));
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

  test("ignores stale replacement markers for creeps that no longer exist", () => {
    const first = createWorker("worker-1", 0);
    const second = createWorker("worker-2", 0);
    first.memory.replacing = "dead-worker-a";
    second.memory.replacing = "dead-worker-b";
    const spawn = createSpawn(550);
    const room = createRoom({
      rcl: 2,
      structures: [spawn],
      creeps: [first, second],
      energyAvailable: 550,
      energyCapacityAvailable: 550
    });

    runColony({
      game: { time: 17, rooms: { W1N1: room }, creeps: { "worker-1": first, "worker-2": second } },
      memory: createInitialColonyMemory("W1N1", 2, 17),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringMatching(/^worker-/),
      expect.objectContaining({ memory: expect.objectContaining({ role: "worker" }) })
    );
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

  test("withdraws from neutral containers discovered in all room structures", () => {
    const worker = createWorker("worker-neutral-container", 0);
    const spawn = createSpawn();
    const container = createEnergyStructure(constants.STRUCTURE_CONTAINER, 150);
    const room = createRoom({ structures: [spawn], creeps: [worker] });
    room.find.mockImplementation((constant: number) => {
      if (constant === constants.FIND_MY_STRUCTURES) return [spawn];
      if (constant === constants.FIND_STRUCTURES) return [spawn, container];
      if (constant === constants.FIND_MY_CREEPS) return [worker];
      if (constant === constants.FIND_SOURCES) return [{ id: "source-a", pos: createPos(10, 10) }];
      if (constant === constants.FIND_CONSTRUCTION_SITES) return [];
      if (constant === constants.FIND_HOSTILE_CREEPS) return [];
      return [];
    });

    runColony({
      game: { time: 21, rooms: { W1N1: room }, creeps: { "worker-neutral-container": worker } },
      memory: createInitialColonyMemory("W1N1", 2, 21),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(worker.withdraw).toHaveBeenCalledWith(container, "energy");
    expect(worker.harvest).not.toHaveBeenCalled();
  });

  test("partially loaded worker switches to work when no energy source is available", () => {
    const worker = createWorker("worker-partial", 25);
    worker.memory.mode = "acquire";
    const spawn = createSpawn(300);
    const room = createRoom({ structures: [spawn], creeps: [worker], sources: [] });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.memory.mode).toBe("work");
    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
  });

  test("mostly loaded worker switches to nearby work instead of overharvesting", () => {
    const worker = createWorker("worker-mostly-loaded", 40);
    worker.memory.mode = "acquire";
    worker.pos = createPos(4, 18);
    const spawn = createSpawn(300);
    const buildSite = { id: "site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(5, 18) };
    const room = createRoom({
      structures: [spawn],
      creeps: [worker],
      constructionSites: [buildSite],
      sources: [{ id: "source-a", pos: createPos(5, 19) }]
    });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.memory.mode).toBe("work");
    expect(worker.build).toHaveBeenCalledWith(buildSite);
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

  test("rebalances stale harvest assignments when workers crowd one source", () => {
    const first = createWorker("worker-1", 0);
    const second = createWorker("worker-2", 0);
    first.memory.assignment = { type: "harvest", sourceId: "source-a" };
    second.memory.assignment = { type: "harvest", sourceId: "source-a" };
    const room = createRoom({ structures: [createSpawn()], creeps: [first, second] });
    const snapshot = createColonySnapshot(room, constants);

    runWorker(first, snapshot, constants);
    runWorker(second, snapshot, constants);

    expect(first.memory.assignment).toEqual(expect.objectContaining({ type: "harvest", sourceId: "source-b" }));
    expect(second.memory.assignment).toEqual(expect.objectContaining({ type: "harvest", sourceId: "source-a" }));
  });

  test("abandons stale source assignment when another source has fewer workers", () => {
    const crowded = createWorker("worker-crowded", 0);
    const otherCrowded = createWorker("worker-other-crowded", 0);
    const underassigned = createWorker("worker-underassigned", 0);
    crowded.memory.assignment = { type: "harvest", sourceId: "source-a" };
    otherCrowded.memory.assignment = { type: "harvest", sourceId: "source-a" };
    underassigned.memory.assignment = { type: "harvest", sourceId: "source-b" };
    const room = createRoom({
      structures: [createSpawn()],
      creeps: [crowded, otherCrowded, underassigned]
    });

    runWorker(crowded, createColonySnapshot(room, constants), constants);

    expect(crowded.memory.assignment).toEqual(expect.objectContaining({ type: "harvest", sourceId: "source-b" }));
  });

  test("harvests an adjacent source instead of walking to a stale assignment", () => {
    const worker = createWorker("worker-adjacent-source", 0);
    worker.pos = createPos(9, 10);
    worker.memory.assignment = { type: "harvest", sourceId: "source-a" };
    const farAssigned = createWorker("worker-far-assigned", 0);
    farAssigned.memory.assignment = { type: "harvest", sourceId: "source-b" };
    const farSource = { id: "source-a", pos: createPos(40, 40) };
    const adjacentSource = { id: "source-b", pos: createPos(10, 10) };
    const room = createRoom({
      structures: [createSpawn()],
      creeps: [worker, farAssigned],
      sources: [farSource, adjacentSource]
    });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.memory.assignment).toEqual(expect.objectContaining({ type: "harvest", sourceId: "source-b" }));
    expect(worker.harvest).toHaveBeenCalledWith(adjacentSource);
  });

  test("prefers a nearby source over a distant underassigned source", () => {
    const worker = createWorker("worker-near-local-source", 0);
    worker.pos = createPos(3, 17);
    const localAssigned = createWorker("worker-local-assigned", 0);
    localAssigned.memory.assignment = { type: "harvest", sourceId: "source-local" };
    const localBuilder = createWorker("worker-local-builder", 40);
    localBuilder.memory.assignment = { type: "build", targetId: "site-1" };
    const localSource = { id: "source-local", pos: createPos(5, 19) };
    const distantSource = { id: "source-distant", pos: createPos(19, 7) };
    const room = createRoom({
      structures: [createSpawn()],
      creeps: [worker, localAssigned, localBuilder],
      sources: [localSource, distantSource]
    });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.memory.assignment).toEqual(expect.objectContaining({ type: "harvest", sourceId: "source-local" }));
    expect(worker.harvest).toHaveBeenCalledWith(localSource);
  });

  test("uses a distant source when nearby source access is saturated", () => {
    const worker = createWorker("worker-overflow-source", 0);
    worker.pos = createPos(3, 17);
    const firstHarvester = createWorker("worker-first-harvester", 0);
    firstHarvester.pos = createPos(4, 18);
    firstHarvester.memory.assignment = { type: "harvest", sourceId: "source-local" };
    const secondHarvester = createWorker("worker-second-harvester", 0);
    secondHarvester.pos = createPos(5, 18);
    secondHarvester.memory.assignment = { type: "harvest", sourceId: "source-local" };
    const thirdHarvester = createWorker("worker-third-harvester", 0);
    thirdHarvester.pos = createPos(6, 18);
    thirdHarvester.memory.assignment = { type: "harvest", sourceId: "source-local" };
    const localSource = { id: "source-local", pos: createPos(5, 19) };
    const distantSource = { id: "source-distant", pos: createPos(19, 7) };
    const room = createRoom({
      structures: [createSpawn()],
      creeps: [worker, firstHarvester, secondHarvester, thirdHarvester],
      sources: [localSource, distantSource],
      terrainWalls: ["4,19", "4,20", "5,19", "5,20", "6,19", "6,20"]
    });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.memory.assignment).toEqual(expect.objectContaining({ type: "harvest", sourceId: "source-distant" }));
    expect(worker.harvest).toHaveBeenCalledWith(distantSource);
  });

  test("moves to an open source access tile when nearby harvest spots are occupied", () => {
    const worker = createWorker("worker-needs-access", 0);
    worker.pos = createPos(3, 17);
    worker.harvest.mockReturnValue(constants.ERR_NOT_IN_RANGE);
    const firstHarvester = createWorker("worker-first-harvester", 0);
    firstHarvester.pos = createPos(4, 18);
    const secondHarvester = createWorker("worker-second-harvester", 0);
    secondHarvester.pos = createPos(5, 18);
    const source = { id: "source-local", pos: createPos(5, 19) };
    const room = createRoom({
      structures: [createSpawn()],
      creeps: [worker, firstHarvester, secondHarvester],
      sources: [source],
      terrainWalls: ["4,19", "4,20", "5,19", "5,20", "6,19", "6,20"]
    });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.moveTo).toHaveBeenCalledWith(expect.objectContaining({ pos: expect.objectContaining({ x: 6, y: 18 }) }));
  });

  test("uses a real RoomPosition for explicit harvest access movement when available", () => {
    class FakeRoomPosition {
      constructor(public x: number, public y: number, public roomName: string) {}
    }
    vi.stubGlobal("RoomPosition", FakeRoomPosition);
    const worker = createWorker("worker-needs-room-position", 0);
    worker.pos = createPos(3, 17);
    worker.harvest.mockReturnValue(constants.ERR_NOT_IN_RANGE);
    const firstHarvester = createWorker("worker-first-harvester", 0);
    firstHarvester.pos = createPos(4, 18);
    const secondHarvester = createWorker("worker-second-harvester", 0);
    secondHarvester.pos = createPos(5, 18);
    const source = { id: "source-local", pos: createPos(5, 19) };
    const room = createRoom({
      structures: [createSpawn()],
      creeps: [worker, firstHarvester, secondHarvester],
      sources: [source],
      terrainWalls: ["4,19", "4,20", "5,19", "5,20", "6,19", "6,20"]
    });

    try {
      runWorker(worker, createColonySnapshot(room, constants), constants);

      expect(worker.moveTo).toHaveBeenCalledWith(expect.objectContaining({ x: 6, y: 18, roomName: "W1N1" }));
    } finally {
      vi.unstubAllGlobals();
    }
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

  test("continues valid upgrade assignment when a build crew already exists", () => {
    const worker = createWorker("worker-sticky-upgrade", 50);
    worker.memory.assignment = { type: "upgrade", targetId: "controller" };
    const firstBuilder = createWorker("worker-builder-1", 50);
    firstBuilder.memory.assignment = { type: "build", targetId: "extension-site-1" };
    const secondBuilder = createWorker("worker-builder-2", 50);
    secondBuilder.memory.assignment = { type: "build", targetId: "extension-site-2" };
    const harvester = createWorker("worker-harvester-1", 0);
    harvester.memory.assignment = { type: "harvest", sourceId: "source-1" };
    const refiller = createWorker("worker-refiller-1", 0);
    refiller.memory.assignment = { type: "harvest", sourceId: "source-2" };
    const extensionSites = [
      { id: "extension-site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(22, 20) },
      { id: "extension-site-2", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(23, 20) },
      { id: "extension-site-3", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(24, 20) }
    ];
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn(300)],
      creeps: [worker, firstBuilder, secondBuilder, harvester, refiller],
      constructionSites: extensionSites
    });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
    expect(worker.build).not.toHaveBeenCalled();
  });

  test("continues valid upgrade assignment even when build crew drops below target", () => {
    const worker = createWorker("worker-sticky-upgrade-solo", 50);
    worker.memory.assignment = { type: "upgrade", targetId: "controller" };
    const builder = createWorker("worker-builder-1", 50);
    builder.memory.assignment = { type: "build", targetId: "extension-site-1" };
    const harvester = createWorker("worker-harvester-1", 0);
    harvester.memory.assignment = { type: "harvest", sourceId: "source-1" };
    const extensionSites = [
      { id: "extension-site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(22, 20) },
      { id: "extension-site-2", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(23, 20) }
    ];
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn(300)],
      creeps: [worker, builder, harvester],
      constructionSites: extensionSites
    });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
    expect(worker.build).not.toHaveBeenCalled();
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

  test("repairs critical infrastructure before routine upgrading", () => {
    const worker = createWorker("worker-repair", 50);
    const damagedSpawn = { ...createSpawn(300), hits: 1000, hitsMax: 5000 };
    const room = createRoom({ structures: [damagedSpawn], creeps: [worker] });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.repair).toHaveBeenCalledWith(damagedSpawn);
    expect(worker.upgradeController).not.toHaveBeenCalled();
  });

  test("honors configured repair threshold for critical infrastructure", () => {
    const worker = createWorker("worker-repair-config", 50);
    const damagedSpawn = { ...createSpawn(300), hits: 1750, hitsMax: 5000 };
    const room = createRoom({ structures: [damagedSpawn], creeps: [worker] });

    runColony({
      game: { time: 45, rooms: { W1N1: room }, creeps: { "worker-repair-config": worker } },
      memory: createInitialColonyMemory("W1N1", 2, 45),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { repairThreshold: 0.3 }
    });

    expect(worker.repair).not.toHaveBeenCalled();
    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
  });

  test("refills spawn before tower regardless of structure scan order", () => {
    const worker = createWorker("worker-refill-priority", 50);
    const tower = createTower(100);
    const spawn = createSpawn(0);
    const room = createRoom({ structures: [tower, spawn], creeps: [worker] });

    runWorker(worker, createColonySnapshot(room, constants), constants);

    expect(worker.transfer).toHaveBeenCalledWith(spawn, "energy");
    expect(worker.transfer).not.toHaveBeenCalledWith(tower, "energy");
  });

  test("honors configured tower energy reserve for worker refills", () => {
    const worker = createWorker("worker-tower-reserve", 50);
    const spawn = createSpawn(300);
    const tower = createTower(600);
    const room = createRoom({ structures: [spawn, tower], creeps: [worker] });

    runColony({
      game: { time: 46, rooms: { W1N1: room }, creeps: { "worker-tower-reserve": worker } },
      memory: createInitialColonyMemory("W1N1", 3, 46),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { towerEnergyReserve: 700 }
    });

    expect(worker.transfer).toHaveBeenCalledWith(tower, "energy");
    expect(worker.upgradeController).not.toHaveBeenCalled();
  });

  test("does not attempt work actions without required live body parts", () => {
    const noWorkHarvester = createWorker("worker-no-work", 0);
    noWorkHarvester.body = [{ type: constants.CARRY }, { type: constants.MOVE }];
    const harvestRoom = createRoom({ structures: [createSpawn()], creeps: [noWorkHarvester] });

    runWorker(noWorkHarvester, createColonySnapshot(harvestRoom, constants), constants);
    expect(noWorkHarvester.harvest).not.toHaveBeenCalled();
    expect(noWorkHarvester.moveTo).not.toHaveBeenCalled();

    const noWorkBuilder = createWorker("worker-no-work-loaded", 50);
    noWorkBuilder.body = [{ type: constants.CARRY }, { type: constants.MOVE }];
    const fullSpawn = createSpawn(300);
    const buildSite = { id: "site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(22, 20) };
    const workRoom = createRoom({
      structures: [fullSpawn],
      creeps: [noWorkBuilder],
      constructionSites: [buildSite]
    });

    runWorker(noWorkBuilder, createColonySnapshot(workRoom, constants), constants);
    expect(noWorkBuilder.build).not.toHaveBeenCalled();
    expect(noWorkBuilder.upgradeController).not.toHaveBeenCalled();
    expect(noWorkBuilder.repair).not.toHaveBeenCalled();
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

  test("one creep action failure does not stop other creeps from running", () => {
    const failingWorker = createWorker("worker-failing", 0);
    failingWorker.harvest.mockImplementation(() => {
      throw new Error("harvest failed");
    });
    const healthyWorker = createWorker("worker-healthy", 0);
    const room = createRoom({ structures: [createSpawn()], creeps: [failingWorker, healthyWorker] });
    const log = vi.fn();

    expect(() =>
      runColony({
        game: {
          time: 35,
          rooms: { W1N1: room },
          creeps: { "worker-failing": failingWorker, "worker-healthy": healthyWorker }
        },
        memory: createInitialColonyMemory("W1N1", 1, 35),
        constants,
        log,
        cpu: { getUsed: () => 1, bucket: 10000 }
      })
    ).not.toThrow();

    expect(healthyWorker.harvest).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[colony W1N1] creep worker-failing failed: harvest failed");
  });

  test("uses configured construction planning cadence unless force replan is set", () => {
    const worker = createWorker("worker-planner", 50);
    const room = Object.assign(createRoom({ rcl: 2, structures: [createSpawn()] }), {
      createConstructionSite: vi.fn(() => constants.OK)
    });
    room.find.mockImplementation((constant: number) => {
      if (constant === constants.FIND_MY_STRUCTURES) return [createSpawn()];
      if (constant === constants.FIND_STRUCTURES) return [createSpawn()];
      if (constant === constants.FIND_MY_CREEPS) return [worker];
      if (constant === constants.FIND_SOURCES) return [
        { id: "source-a", pos: createPos(10, 10) },
        { id: "source-b", pos: createPos(40, 40) }
      ];
      if (constant === constants.FIND_CONSTRUCTION_SITES) return [];
      if (constant === constants.FIND_HOSTILE_CREEPS) return [];
      return [];
    });
    const memory = createInitialColonyMemory("W1N1", 2, 1);
    memory.lastPlanTick = 1;

    runColony({
      game: { time: 20, rooms: { W1N1: room }, creeps: { "worker-planner": worker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { planningCadence: 50 }
    });

    expect(room.createConstructionSite).not.toHaveBeenCalled();

    memory.forceReplan = true;
    runColony({
      game: { time: 21, rooms: { W1N1: room }, creeps: { "worker-planner": worker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { planningCadence: 50 }
    });

    expect(room.createConstructionSite).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), "extension");
  });

  test("records construction plan memory only after the room accepts the site", () => {
    const worker = createWorker("worker-rejected-plan", 50);
    const room = Object.assign(createRoom({ rcl: 2, structures: [createSpawn(300)], creeps: [worker] }), {
      createConstructionSite: vi.fn(() => -14)
    });
    const memory = createInitialColonyMemory("W1N1", 2, 60);

    runColony({
      game: { time: 60, rooms: { W1N1: room }, creeps: { "worker-rejected-plan": worker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(room.createConstructionSite).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), "extension");
    expect(memory.lastConstructionPlan).toBeUndefined();
  });

  test("uses configured controller downgrade threshold before construction", () => {
    const worker = createWorker("worker-controller-risk", 50);
    const spawn = createSpawn(300);
    const buildSite = { id: "site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(22, 20) };
    const room = createRoom({ structures: [spawn], creeps: [worker], constructionSites: [buildSite] });
    room.controller.ticksToDowngrade = 9000;

    runColony({
      game: { time: 50, rooms: { W1N1: room }, creeps: { "worker-controller-risk": worker } },
      memory: createInitialColonyMemory("W1N1", 2, 50),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { controllerEmergencyThreshold: 10000 }
    });

    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
    expect(worker.build).not.toHaveBeenCalled();
  });

  test("builds in-range critical construction before long-distance controller recovery", () => {
    const worker = createWorker("worker-near-critical-build", 50);
    worker.pos = createPos(4, 18);
    const spawn = createSpawn(300);
    const buildSite = { id: "site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(5, 18) };
    const room = createRoom({ structures: [spawn], creeps: [worker], constructionSites: [buildSite] });
    room.controller.ticksToDowngrade = 9000;

    runColony({
      game: { time: 51, rooms: { W1N1: room }, creeps: { "worker-near-critical-build": worker } },
      memory: createInitialColonyMemory("W1N1", 2, 51),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { controllerEmergencyThreshold: 10000 }
    });

    expect(worker.build).toHaveBeenCalledWith(buildSite);
    expect(worker.upgradeController).not.toHaveBeenCalled();
  });

  test("keeps controller progress while enough workers are already building extensions", () => {
    const worker = createWorker("worker-upgrade-with-builders", 50);
    const firstBuilder = createWorker("worker-builder-1", 50);
    firstBuilder.memory.assignment = { type: "build", targetId: "extension-site-1" };
    const secondBuilder = createWorker("worker-builder-2", 50);
    secondBuilder.memory.assignment = { type: "build", targetId: "extension-site-2" };
    const extensionSites = [
      { id: "extension-site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(22, 20) },
      { id: "extension-site-2", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(23, 20) },
      { id: "extension-site-3", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(24, 20) }
    ];
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn(300)],
      creeps: [worker, firstBuilder, secondBuilder],
      constructionSites: extensionSites
    });

    runColony({
      game: {
        time: 52,
        rooms: { W1N1: room },
        creeps: {
          "worker-upgrade-with-builders": worker,
          "worker-builder-1": firstBuilder,
          "worker-builder-2": secondBuilder
        }
      },
      memory: createInitialColonyMemory("W1N1", 2, 52),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
    expect(worker.build).not.toHaveBeenCalled();
  });

  test("allows another extension builder when the workforce can still upgrade", () => {
    const worker = createWorker("worker-third-extension-builder", 50);
    const firstBuilder = createWorker("worker-builder-1", 50);
    firstBuilder.memory.assignment = { type: "build", targetId: "extension-site-1" };
    const secondBuilder = createWorker("worker-builder-2", 50);
    secondBuilder.memory.assignment = { type: "build", targetId: "extension-site-2" };
    const upgrader = createWorker("worker-upgrader-1", 50);
    upgrader.memory.assignment = { type: "upgrade", targetId: "controller-1" };
    const harvester = createWorker("worker-harvester-1", 0);
    harvester.memory.assignment = { type: "harvest", sourceId: "source-1" };
    const refill = createWorker("worker-refill-1", 0);
    refill.memory.assignment = { type: "harvest", sourceId: "source-2" };
    const extensionSites = [
      { id: "extension-site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(22, 20) },
      { id: "extension-site-2", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(23, 20) },
      { id: "extension-site-3", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(24, 20) }
    ];
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn(300)],
      creeps: [worker, firstBuilder, secondBuilder, upgrader, harvester, refill],
      constructionSites: extensionSites
    });

    runColony({
      game: {
        time: 54,
        rooms: { W1N1: room },
        creeps: {
          "worker-third-extension-builder": worker,
          "worker-builder-1": firstBuilder,
          "worker-builder-2": secondBuilder,
          "worker-upgrader-1": upgrader,
          "worker-harvester-1": harvester,
          "worker-refill-1": refill
        }
      },
      memory: createInitialColonyMemory("W1N1", 2, 54),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(worker.build).toHaveBeenCalledWith(extensionSites[0]);
    expect(worker.upgradeController).not.toHaveBeenCalled();
  });

  test("keeps controller progress while enough workers are already building a tower", () => {
    const worker = createWorker("worker-upgrade-with-tower-builders", 50);
    const firstBuilder = createWorker("worker-tower-builder-1", 50);
    firstBuilder.memory.assignment = { type: "build", targetId: "tower-site-1" };
    const secondBuilder = createWorker("worker-tower-builder-2", 50);
    secondBuilder.memory.assignment = { type: "build", targetId: "tower-site-1" };
    const thirdBuilder = createWorker("worker-tower-builder-3", 50);
    thirdBuilder.memory.assignment = { type: "build", targetId: "tower-site-1" };
    const towerSite = { id: "tower-site-1", structureType: constants.STRUCTURE_TOWER, pos: createPos(22, 20) };
    const room = createRoom({
      rcl: 3,
      structures: [createSpawn(300)],
      creeps: [worker, firstBuilder, secondBuilder, thirdBuilder],
      constructionSites: [towerSite]
    });

    runColony({
      game: {
        time: 53,
        rooms: { W1N1: room },
        creeps: {
          "worker-upgrade-with-tower-builders": worker,
          "worker-tower-builder-1": firstBuilder,
          "worker-tower-builder-2": secondBuilder,
          "worker-tower-builder-3": thirdBuilder
        }
      },
      memory: createInitialColonyMemory("W1N1", 3, 53),
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
    expect(worker.build).not.toHaveBeenCalled();
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

  test("does not consume the last open source access tile", () => {
    const sourceRoom = createRoom({
      rcl: 2,
      structures: [createSpawn()],
      sources: [{ id: "source-a", pos: createPos(23, 20) }],
      terrainWalls: ["22,19", "23,19", "24,19", "24,20", "22,21", "23,21", "24,21"]
    });
    const plan = planConstruction(
      createColonySnapshot(sourceRoom, constants),
      createInitialColonyMemory("W1N1", 2, 1),
      constants,
      1
    );

    expect(plan).toEqual(expect.objectContaining({ structureType: "extension" }));
    expect(plan).not.toEqual(expect.objectContaining({ x: 22, y: 20 }));
  });

  test("does not place non-container construction on source access tiles", () => {
    const source = { id: "source-a", pos: createPos(23, 20) };
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn()],
      sources: [source]
    });

    const plan = planConstruction(
      createColonySnapshot(room, constants),
      createInitialColonyMemory("W1N1", 2, 1),
      constants,
      1
    );

    expect(plan).toEqual(expect.objectContaining({ structureType: "extension" }));
    expect(Math.max(Math.abs((plan?.x ?? 0) - source.pos.x), Math.abs((plan?.y ?? 0) - source.pos.y))).toBeGreaterThan(1);
  });

  test("does not place non-container construction in source approach chokes", () => {
    const source = { id: "source-a", pos: createPos(5, 19) };
    const spawn = createSpawn();
    spawn.pos = createPos(3, 18);
    const room = createRoom({
      rcl: 2,
      structures: [spawn],
      sources: [source],
      terrainWalls: ["2,16", "3,16", "4,16", "5,16", "4,19", "4,20", "5,19", "5,20", "6,19", "6,20"]
    });

    const plan = planConstruction(
      createColonySnapshot(room, constants),
      createInitialColonyMemory("W1N1", 2, 1),
      constants,
      1
    );

    expect(plan).toEqual(expect.objectContaining({ structureType: "extension" }));
    expect(Math.max(Math.abs((plan?.x ?? 0) - source.pos.x), Math.abs((plan?.y ?? 0) - source.pos.y))).toBeGreaterThan(2);
  });

  test("searches beyond the initial spawn ring after reserving source approach tiles", () => {
    const source = { id: "source-a", pos: createPos(5, 19) };
    const spawn = createSpawn();
    spawn.pos = createPos(3, 18);
    const room = createRoom({
      rcl: 2,
      structures: [spawn],
      sources: [source],
      terrainWalls: ["2,16", "2,20", "3,15", "3,16", "3,20", "3,21", "4,16", "4,20", "5,19", "5,20"]
    });

    const plan = planConstruction(
      createColonySnapshot(room, constants),
      createInitialColonyMemory("W1N1", 2, 1),
      constants,
      1
    );

    expect(plan).toEqual(expect.objectContaining({ structureType: "extension" }));
    expect(Math.max(Math.abs((plan?.x ?? 0) - source.pos.x), Math.abs((plan?.y ?? 0) - source.pos.y))).toBeGreaterThan(2);
  });

  test("removes existing non-container construction from source access tiles", () => {
    const badSite = {
      id: "bad-extension-site",
      structureType: constants.STRUCTURE_EXTENSION,
      pos: createPos(22, 20),
      remove: vi.fn(() => constants.OK)
    };
    const worker = createWorker("worker-builder", 0);
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn()],
      creeps: [worker],
      sources: [{ id: "source-a", pos: createPos(23, 20) }],
      constructionSites: [badSite]
    });
    const memory = createInitialColonyMemory("W1N1", 2, 1);

    runColony({
      game: { time: 1, rooms: { W1N1: room }, creeps: { "worker-builder": worker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { planningCadence: 100 }
    });

    expect(badSite.remove).toHaveBeenCalled();
    expect(memory.forceReplan).toBe(true);
  });

  test("removes existing non-container construction from source approach chokes", () => {
    const badSite = {
      id: "bad-approach-site",
      structureType: constants.STRUCTURE_EXTENSION,
      pos: createPos(5, 17),
      remove: vi.fn(() => constants.OK)
    };
    const worker = createWorker("worker-builder", 0);
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn()],
      creeps: [worker],
      sources: [{ id: "source-a", pos: createPos(5, 19) }],
      constructionSites: [badSite]
    });
    const memory = createInitialColonyMemory("W1N1", 2, 1);

    runColony({
      game: { time: 1, rooms: { W1N1: room }, creeps: { "worker-builder": worker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { planningCadence: 100 }
    });

    expect(badSite.remove).toHaveBeenCalled();
    expect(memory.forceReplan).toBe(true);
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
    const earlyRcl4Room = createRoom({ rcl: 4, structures: [createSpawn(), tower, ...extensions, ...containers] });
    expect(planConstruction(createColonySnapshot(earlyRcl4Room, constants), createInitialColonyMemory("W1N1", 4, 1), constants, 1))
      .toEqual(expect.objectContaining({ structureType: "extension" }));

    const rcl4Extensions = Array.from({ length: 20 }, (_, index) =>
      createEnergyStructure(constants.STRUCTURE_EXTENSION, 0, 50 + index)
    );
    const rcl4Room = createRoom({ rcl: 4, structures: [createSpawn(), tower, ...rcl4Extensions, ...containers] });
    expect(planConstruction(createColonySnapshot(rcl4Room, constants), createInitialColonyMemory("W1N1", 4, 1), constants, 1))
      .toEqual(expect.objectContaining({ structureType: "storage" }));
  });

  test("places RCL3 source containers adjacent to an unserved source", () => {
    const extensions = Array.from({ length: 10 }, (_, index) =>
      createEnergyStructure(constants.STRUCTURE_EXTENSION, 0, 50 + index)
    );
    const tower = createEnergyStructure(constants.STRUCTURE_TOWER, 500, 1000);
    const source = { id: "source-a", pos: createPos(10, 10) };
    const room = createRoom({
      rcl: 3,
      structures: [createSpawn(), tower, ...extensions],
      sources: [source]
    });

    const plan = planConstruction(
      createColonySnapshot(room, constants),
      createInitialColonyMemory("W1N1", 3, 1),
      constants,
      1
    );

    expect(plan).toEqual(expect.objectContaining({ structureType: "container" }));
    expect(Math.max(Math.abs((plan?.x ?? 0) - source.pos.x), Math.abs((plan?.y ?? 0) - source.pos.y))).toBe(1);
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

  test("tower repairs important infrastructure before roads", () => {
    const road = { id: "road", structureType: constants.STRUCTURE_ROAD, hits: 50, hitsMax: 500 };
    const spawn = { id: "spawn", structureType: constants.STRUCTURE_SPAWN, hits: 1000, hitsMax: 5000 };
    const tower = {
      store: { getUsedCapacity: vi.fn(() => 900) },
      attack: vi.fn(),
      heal: vi.fn(),
      repair: vi.fn()
    };

    runTower({ tower, hostiles: [], injuredFriendlies: [], repairTargets: [road, spawn], constants, reserve: 500 });

    expect(tower.repair).toHaveBeenCalledWith(spawn);
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

describe("integration scenarios", () => {
  test("scenario A: fresh RCL1 room bootstraps workers and upgrades controller", () => {
    const log = vi.fn();
    const memory = createInitialColonyMemory("W1N1", 1, 60);
    const bootstrapSpawn = createSpawn(300);
    const bootstrapRoom = createRoom({
      rcl: 1,
      structures: [bootstrapSpawn],
      energyAvailable: 300,
      energyCapacityAvailable: 300
    });

    runColony({
      game: { time: 60, rooms: { W1N1: bootstrapRoom }, creeps: {} },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(bootstrapSpawn.spawnCreep).toHaveBeenCalledWith(
      ["work", "carry", "move"],
      expect.stringMatching(/^emergency-worker-/),
      expect.objectContaining({
        memory: expect.objectContaining({ colony: "W1N1", role: "emergency-worker", mode: "acquire" })
      })
    );

    const harvester = createWorker("emergency-worker-60", 0);
    harvester.memory.role = "emergency-worker";
    harvester.memory.mode = "acquire";
    const harvestRoom = createRoom({ rcl: 1, structures: [createSpawn(300)], creeps: [harvester] });

    runColony({
      game: { time: 61, rooms: { W1N1: harvestRoom }, creeps: { "emergency-worker-60": harvester } },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(harvester.harvest).toHaveBeenCalledWith(expect.objectContaining({ id: "source-a" }));

    const refiller = createWorker("emergency-worker-60", 50);
    refiller.memory.role = "emergency-worker";
    refiller.memory.mode = "work";
    const needySpawn = createSpawn(0);
    const refillRoom = createRoom({ rcl: 1, structures: [needySpawn], creeps: [refiller], energyAvailable: 0 });

    runColony({
      game: { time: 62, rooms: { W1N1: refillRoom }, creeps: { "emergency-worker-60": refiller } },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(refiller.transfer).toHaveBeenCalledWith(needySpawn, "energy");

    const spawn = createSpawn(300);
    const existingWorkers = [
      createWorker("worker-1", 0),
      createWorker("worker-2", 0)
    ];
    const growthRoom = createRoom({
      rcl: 1,
      structures: [spawn],
      creeps: existingWorkers,
      energyAvailable: 300,
      energyCapacityAvailable: 300
    });

    runColony({
      game: {
        time: 63,
        rooms: { W1N1: growthRoom },
        creeps: Object.fromEntries(existingWorkers.map((worker) => [worker.name, worker]))
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      expect.arrayContaining(["work", "carry", "move"]),
      expect.stringMatching(/^worker-/),
      expect.objectContaining({ memory: expect.objectContaining({ role: "worker" }) })
    );

    const upgrader = createWorker("worker-upgrader", 50);
    upgrader.memory.role = "worker";
    upgrader.memory.mode = "work";
    const upgradeRoom = createRoom({ rcl: 1, structures: [createSpawn(300)], creeps: [upgrader] });

    runColony({
      game: { time: 64, rooms: { W1N1: upgradeRoom }, creeps: { "worker-upgrader": upgrader } },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(upgrader.upgradeController).toHaveBeenCalledWith(upgradeRoom.controller);
  });

  test("scenario B: total workforce death enters emergency and rebuilds normal operation", () => {
    const log = vi.fn();
    const memory = createInitialColonyMemory("W1N1", 2, 70);
    memory.emergency = false;
    memory.workforceTarget = 4;
    const bootstrapSpawn = createSpawn(200);
    const deadRoom = Object.assign(createRoom({
      rcl: 2,
      structures: [bootstrapSpawn],
      energyAvailable: 200,
      energyCapacityAvailable: 550
    }), {
      createConstructionSite: vi.fn(() => constants.OK)
    });

    runColony({
      game: { time: 70, rooms: { W1N1: deadRoom }, creeps: {} },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(memory.emergency).toBe(true);
    expect(log).toHaveBeenCalledWith("[colony W1N1] emergency mode entered: no viable workers");
    expect(deadRoom.createConstructionSite).not.toHaveBeenCalled();
    expect(bootstrapSpawn.spawnCreep).toHaveBeenCalledWith(
      ["work", "carry", "move"],
      expect.stringMatching(/^emergency-worker-/),
      expect.objectContaining({
        memory: expect.objectContaining({ role: "emergency-worker", mode: "acquire" })
      })
    );

    const emergencyHarvester = createWorker("emergency-worker-70", 0);
    emergencyHarvester.memory.role = "emergency-worker";
    emergencyHarvester.memory.mode = "acquire";
    const harvestRoom = createRoom({
      rcl: 2,
      structures: [createSpawn(300)],
      creeps: [emergencyHarvester],
      energyAvailable: 300,
      energyCapacityAvailable: 550
    });

    runColony({
      game: { time: 71, rooms: { W1N1: harvestRoom }, creeps: { "emergency-worker-70": emergencyHarvester } },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(emergencyHarvester.harvest).toHaveBeenCalled();

    const emergencyRefiller = createWorker("emergency-worker-70", 50);
    emergencyRefiller.memory.role = "emergency-worker";
    emergencyRefiller.memory.mode = "work";
    const needySpawn = createSpawn(0);
    const refillRoom = createRoom({
      rcl: 2,
      structures: [needySpawn],
      creeps: [emergencyRefiller],
      energyAvailable: 0,
      energyCapacityAvailable: 550
    });

    runColony({
      game: { time: 72, rooms: { W1N1: refillRoom }, creeps: { "emergency-worker-70": emergencyRefiller } },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(emergencyRefiller.transfer).toHaveBeenCalledWith(needySpawn, "energy");
    expect(memory.emergency).toBe(false);
    expect(log).toHaveBeenCalledWith("[colony W1N1] emergency mode cleared");
  });

  test("scenario C: RCL2 transition plans extensions, builds them, and spawns stronger bodies", () => {
    const log = vi.fn();
    const memory = createInitialColonyMemory("W1N1", 1, 100);
    memory.workforceTarget = 3;
    const workers = [
      createWorker("worker-1", 50),
      createWorker("worker-2", 50),
      createWorker("worker-3", 50),
      createWorker("worker-4", 50)
    ];
    const spawn = createSpawn(300);
    const transitionRoom = Object.assign(createRoom({
      rcl: 2,
      structures: [spawn],
      creeps: workers,
      energyAvailable: 300,
      energyCapacityAvailable: 300
    }), {
      createConstructionSite: vi.fn(() => constants.OK)
    });

    runColony({
      game: {
        time: 100,
        rooms: { W1N1: transitionRoom },
        creeps: Object.fromEntries(workers.map((worker) => [worker.name, worker]))
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(log).toHaveBeenCalledWith("[colony W1N1] reached RCL 2");
    expect(transitionRoom.createConstructionSite).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), "extension");
    expect(log).toHaveBeenCalledWith("[colony W1N1] construction plan updated: 1/5 extensions");

    const extensionSite = { id: "extension-site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(22, 20) };
    const builder = createWorker("builder", 50);
    const buildRoom = createRoom({
      rcl: 2,
      structures: [createSpawn(300)],
      creeps: [builder],
      constructionSites: [extensionSite]
    });

    runColony({
      game: { time: 101, rooms: { W1N1: buildRoom }, creeps: { builder } },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(builder.build).toHaveBeenCalledWith(extensionSite);

    const extensions = Array.from({ length: 5 }, (_, index) => ({
      ...createEnergyStructure(constants.STRUCTURE_EXTENSION, 50, 50),
      id: `extension-${index}`
    }));
    const strongerSpawn = createSpawn(300);
    const experiencedWorkers = [
      createWorker("experienced-1", 0),
      createWorker("experienced-2", 0),
      createWorker("experienced-3", 0)
    ];
    const matureRcl2Room = createRoom({
      rcl: 2,
      structures: [strongerSpawn, ...extensions],
      creeps: experiencedWorkers,
      energyAvailable: 550,
      energyCapacityAvailable: 550
    });

    runColony({
      game: {
        time: 102,
        rooms: { W1N1: matureRcl2Room },
        creeps: Object.fromEntries(experiencedWorkers.map((worker) => [worker.name, worker]))
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(strongerSpawn.spawnCreep).toHaveBeenCalledWith(
      expect.arrayContaining(["work", "work", "carry", "carry", "move", "move"]),
      expect.stringMatching(/^worker-/),
      expect.any(Object)
    );
  });

  test("scenario D: RCL3 transition plans and builds a defensive tower", () => {
    const log = vi.fn();
    const memory = createInitialColonyMemory("W1N1", 2, 200);
    memory.workforceTarget = 4;
    const extensions = Array.from({ length: 5 }, (_, index) => ({
      ...createEnergyStructure(constants.STRUCTURE_EXTENSION, 50, 50),
      id: `extension-${index}`
    }));
    const workers = [
      createWorker("worker-1", 50),
      createWorker("worker-2", 50),
      createWorker("worker-3", 50),
      createWorker("worker-4", 50),
      createWorker("worker-5", 50)
    ];
    const transitionRoom = Object.assign(createRoom({
      rcl: 3,
      structures: [createSpawn(300), ...extensions],
      creeps: workers,
      energyAvailable: 550,
      energyCapacityAvailable: 550
    }), {
      createConstructionSite: vi.fn(() => constants.OK)
    });

    runColony({
      game: {
        time: 200,
        rooms: { W1N1: transitionRoom },
        creeps: Object.fromEntries(workers.map((worker) => [worker.name, worker]))
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(log).toHaveBeenCalledWith("[colony W1N1] reached RCL 3");
    expect(transitionRoom.createConstructionSite).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), "tower");
    expect(log).toHaveBeenCalledWith("[colony W1N1] construction plan updated: 1/1 tower");

    const towerSite = { id: "tower-site-1", structureType: constants.STRUCTURE_TOWER, pos: createPos(22, 20) };
    const extensionSite = { id: "extension-site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(23, 20) };
    const builder = createWorker("builder", 50);
    const buildRoom = createRoom({
      rcl: 3,
      structures: [createSpawn(300), ...extensions],
      creeps: [builder],
      constructionSites: [extensionSite, towerSite]
    });

    runColony({
      game: { time: 201, rooms: { W1N1: buildRoom }, creeps: { builder } },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(builder.build).toHaveBeenCalledWith(towerSite);
    expect(builder.build).not.toHaveBeenCalledWith(extensionSite);

    const hostile = { id: "hostile" };
    const damagedRoad = { id: "road", structureType: constants.STRUCTURE_ROAD, hits: 20, hitsMax: 500, pos: createPos(24, 20) };
    const tower = createTower(900);
    const defenseRoom = createRoom({
      rcl: 3,
      structures: [createSpawn(300), tower, damagedRoad],
      hostiles: [hostile]
    });

    runColony({
      game: { time: 202, rooms: { W1N1: defenseRoom }, creeps: {} },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(tower.attack).toHaveBeenCalledWith(hostile);
    expect(tower.repair).not.toHaveBeenCalled();

    tower.attack.mockClear();
    tower.repair.mockClear();
    tower.store.getUsedCapacity.mockReturnValue(400);
    const reserveRoom = createRoom({
      rcl: 3,
      structures: [createSpawn(300), tower, damagedRoad]
    });

    runColony({
      game: { time: 203, rooms: { W1N1: reserveRoom }, creeps: {} },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(tower.attack).not.toHaveBeenCalled();
    expect(tower.repair).not.toHaveBeenCalled();
  });

  test("scenario E: expiring critical worker gets one replacement while harvesting continues", () => {
    const log = vi.fn();
    const memory = createInitialColonyMemory("W1N1", 2, 300);
    memory.workforceTarget = 4;
    const expiringHarvester = createWorker("worker-expiring", 0, 100);
    expiringHarvester.memory.role = "worker";
    expiringHarvester.memory.mode = "acquire";
    const stableWorker = createWorker("worker-stable", 0, 1400);
    stableWorker.memory.role = "worker";
    stableWorker.memory.mode = "acquire";
    const spawn = createSpawn(550);
    const firstRoom = createRoom({
      rcl: 2,
      structures: [spawn],
      creeps: [expiringHarvester, stableWorker],
      energyAvailable: 550,
      energyCapacityAvailable: 550
    });

    runColony({
      game: {
        time: 300,
        rooms: { W1N1: firstRoom },
        creeps: { "worker-expiring": expiringHarvester, "worker-stable": stableWorker }
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringMatching(/^worker-/),
      expect.objectContaining({
        memory: expect.objectContaining({ replacing: "worker-expiring" })
      })
    );
    expect(expiringHarvester.harvest).toHaveBeenCalled();

    spawn.spawnCreep.mockClear();
    expiringHarvester.harvest.mockClear();
    const incomingReplacement = createWorker("worker-300", 0, 1500);
    incomingReplacement.memory.role = "worker";
    incomingReplacement.memory.mode = "acquire";
    incomingReplacement.memory.replacing = "worker-expiring";
    const secondRoom = createRoom({
      rcl: 2,
      structures: [spawn],
      creeps: [expiringHarvester, stableWorker, incomingReplacement],
      energyAvailable: 550,
      energyCapacityAvailable: 550
    });

    runColony({
      game: {
        time: 301,
        rooms: { W1N1: secondRoom },
        creeps: {
          "worker-expiring": expiringHarvester,
          "worker-stable": stableWorker,
          "worker-300": incomingReplacement
        }
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(spawn.spawnCreep).not.toHaveBeenCalled();
    expect(expiringHarvester.harvest).toHaveBeenCalled();

    const afterReplacementWorkers = [
      stableWorker,
      incomingReplacement,
      createWorker("worker-extra-1", 0, 1500),
      createWorker("worker-extra-2", 0, 1500)
    ];
    spawn.spawnCreep.mockClear();
    const stableRoom = createRoom({
      rcl: 2,
      structures: [spawn],
      creeps: afterReplacementWorkers,
      energyAvailable: 550,
      energyCapacityAvailable: 550
    });

    runColony({
      game: {
        time: 302,
        rooms: { W1N1: stableRoom },
        creeps: Object.fromEntries(afterReplacementWorkers.map((worker) => [worker.name, worker]))
      },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(spawn.spawnCreep).not.toHaveBeenCalled();
  });
});

describe("memory, console API, and observability", () => {
  test("room visual includes compact assignment counts", () => {
    const harvester = createWorker("worker-harvest", 0);
    harvester.memory.assignment = { type: "harvest", sourceId: "source-a" };
    const deliverer = createWorker("worker-deliver", 50);
    deliverer.memory.assignment = { type: "deliver", targetId: "spawn-1" };
    const upgrader = createWorker("worker-upgrade", 50);
    upgrader.memory.assignment = { type: "upgrade", targetId: "controller" };
    const builder = createWorker("worker-build", 50);
    builder.memory.assignment = { type: "build", targetId: "site-1" };
    const repairer = createWorker("worker-repair", 50);
    repairer.memory.assignment = { type: "repair", targetId: "road-1" };
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn(300)],
      creeps: [harvester, deliverer, upgrader, builder, repairer]
    });
    const memory = createInitialColonyMemory("W1N1", 2, 1);
    memory.strategy = "infrastructure-push";

    drawRoomStatusVisual({
      snapshot: createColonySnapshot(room, constants),
      memory,
      workers: 5,
      desiredWorkers: 5,
      cpuUsed: 1.4
    });

    expect(room.visual.text).toHaveBeenCalledWith(
      expect.stringContaining("Assignments:\nHarvest 1\nDeliver 1\nUpgrade 1\nBuild 1\nRepair 1"),
      expect.any(Number),
      expect.any(Number),
      expect.any(Object)
    );
    expect(room.visual.text).toHaveBeenCalledWith(
      expect.stringContaining("Strategy: infrastructure-push"),
      expect.any(Number),
      expect.any(Number),
      expect.any(Object)
    );
  });

  test("logs concise colony status only at the configured interval", () => {
    const harvester = createWorker("worker-1", 0);
    const deliverer = createWorker("worker-2", 50);
    const upgrader = createWorker("worker-3", 50);
    const builder = createWorker("worker-4", 50);
    const workers = [
      harvester,
      deliverer,
      upgrader,
      builder
    ];
    harvester.memory.assignment = { type: "harvest", sourceId: "source-a" };
    deliverer.memory.assignment = { type: "deliver", targetId: "spawn-1" };
    upgrader.memory.assignment = { type: "upgrade", targetId: "controller" };
    builder.memory.assignment = { type: "build", targetId: "site-1" };
    const room = createRoom({
      rcl: 2,
      structures: [createSpawn(300)],
      creeps: workers,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      constructionSites: [{ id: "site-1", structureType: constants.STRUCTURE_EXTENSION, pos: createPos(22, 20) }]
    });
    const memory = createInitialColonyMemory("W1N1", 2, 1);
    memory.lastPlanTick = 1;
    memory.workforceTarget = 4;
    const log = vi.fn();

    runColony({
      game: { time: 9, rooms: { W1N1: room }, creeps: Object.fromEntries(workers.map((worker) => [worker.name, worker])) },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { statusLogInterval: 10, planningCadence: 100 }
    });
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("status:"));

    runColony({
      game: { time: 10, rooms: { W1N1: room }, creeps: Object.fromEntries(workers.map((worker) => [worker.name, worker])) },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1.5, bucket: 10000 },
      config: { statusLogInterval: 10, planningCadence: 100 }
    });

    expect(log).toHaveBeenCalledWith(
      "[colony W1N1] status: RCL 2 NORMAL energy 300/550 workers 4/4 assignments H1 D0 U2 B1 R0 sites 1 cpu 0.0"
    );
    expect(memory.lastStatusLog).toBe(10);

    log.mockClear();
    runColony({
      game: { time: 19, rooms: { W1N1: room }, creeps: Object.fromEntries(workers.map((worker) => [worker.name, worker])) },
      memory,
      constants,
      log,
      cpu: { getUsed: () => 1, bucket: 10000 },
      config: { statusLogInterval: 10, planningCadence: 100 }
    });

    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("status:"));
  });

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
    memory.colonies.W1N1.strategy = "balanced-early";
    const ai = createAiConsole(memory);

    expect(ai.status("W1N1")).toEqual({
      roomName: "W1N1",
      rcl: 2,
      emergency: false,
      strategy: "balanced-early",
      workforceTarget: 0,
      lastPlanTick: 0
    });
    expect(ai.status("W1N1")).not.toHaveProperty("initializedAt");
    ai.setVisuals(false);
    ai.forceReplan("W1N1");

    expect(memory.config.visualsEnabled).toBe(false);
    expect(memory.colonies.W1N1.forceReplan).toBe(true);
    expect("reset" in ai).toBe(false);
  });

  test("owned-room execution honors visuals disabled through root console config", () => {
    const worker = createWorker("worker-visual-config", 50);
    const room = createRoom({ rcl: 2, structures: [createSpawn(300)], creeps: [worker] });
    const memory = {
      colonies: { W1N1: createInitialColonyMemory("W1N1", 2, 1) },
      config: { visualsEnabled: false }
    };

    runOwnedColonies({
      game: { time: 25, rooms: { W1N1: room }, creeps: { "worker-visual-config": worker } },
      memory,
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(room.visual.text).not.toHaveBeenCalled();
  });

  test("owned-room execution reuses one tick-local room snapshot", () => {
    const worker = createWorker("worker-snapshot", 50);
    const room = createRoom({ rcl: 2, structures: [createSpawn(300)], creeps: [worker] });

    runOwnedColonies({
      game: { time: 26, rooms: { W1N1: room }, creeps: { "worker-snapshot": worker } },
      memory: { colonies: { W1N1: createInitialColonyMemory("W1N1", 2, 1) } },
      constants,
      log: vi.fn(),
      cpu: { getUsed: () => 1, bucket: 10000 }
    });

    expect(room.find).toHaveBeenCalledTimes(6);
  });
});

function bodyCost(body: string[]): number {
  return body.reduce((total, part) => total + (part === "work" ? 100 : part === "carry" ? 50 : 50), 0);
}
