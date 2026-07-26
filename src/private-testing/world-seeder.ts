export interface OwnedColonySeedOptions {
  username: string;
  roomName: string;
}

export interface WorldSeedPlan {
  name: "owned-colony";
  username: string;
  roomName: string;
  controller: SeedController;
  sources: SeedSource[];
  structures: SeedStructure[];
  storage: {
    energyAvailable: number;
  };
  cliScript: string;
}

export interface SeedController {
  id: string;
  x: number;
  y: number;
  level: number;
}

export interface SeedSource {
  id: string;
  x: number;
  y: number;
  energy: number;
}

export interface SeedStructure {
  id: string;
  type: "spawn" | "tower" | "extension";
  x: number;
  y: number;
  energy: number;
  energyCapacity: number;
}

export function createOwnedColonySeedPlan(options: OwnedColonySeedOptions): WorldSeedPlan {
  const plan: WorldSeedPlan = {
    name: "owned-colony",
    username: options.username,
    roomName: options.roomName,
    controller: {
      id: `${options.roomName}-controller`,
      x: 25,
      y: 20,
      level: 3
    },
    sources: [
      { id: `${options.roomName}-source-1`, x: 18, y: 22, energy: 3000 },
      { id: `${options.roomName}-source-2`, x: 32, y: 28, energy: 3000 }
    ],
    structures: [
      { id: `${options.roomName}-spawn-1`, type: "spawn", x: 25, y: 25, energy: 300, energyCapacity: 300 },
      { id: `${options.roomName}-tower-1`, type: "tower", x: 23, y: 25, energy: 500, energyCapacity: 1000 },
      { id: `${options.roomName}-extension-1`, type: "extension", x: 24, y: 24, energy: 50, energyCapacity: 50 },
      { id: `${options.roomName}-extension-2`, type: "extension", x: 26, y: 24, energy: 50, energyCapacity: 50 },
      { id: `${options.roomName}-extension-3`, type: "extension", x: 24, y: 26, energy: 50, energyCapacity: 50 },
      { id: `${options.roomName}-extension-4`, type: "extension", x: 26, y: 26, energy: 50, energyCapacity: 50 },
      { id: `${options.roomName}-extension-5`, type: "extension", x: 25, y: 27, energy: 50, energyCapacity: 50 }
    ],
    storage: {
      energyAvailable: 800
    },
    cliScript: ""
  };
  validateWorldSeedPlan(plan);
  return {
    ...plan,
    cliScript: renderSeedCliScript(plan)
  };
}

export function validateWorldSeedPlan(plan: WorldSeedPlan): void {
  const ids = new Set<string>();
  const objects = [
    plan.controller,
    ...plan.sources,
    ...plan.structures
  ];
  for (const object of objects) {
    if (ids.has(object.id)) throw new Error(`Seed plan contains duplicate object id "${object.id}".`);
    ids.add(object.id);
    if (!isRoomCoordinate(object.x) || !isRoomCoordinate(object.y)) {
      throw new Error(`Seed object "${object.id}" has invalid coordinate.`);
    }
  }
}

function renderSeedCliScript(plan: WorldSeedPlan): string {
  return [
    "const plan = " + JSON.stringify(toSerializablePlan(plan)) + ";",
    "Promise.resolve().then(async () => {",
    "  const user = await storage.db.users.findOne({ username: plan.username });",
    "  if (!user) throw new Error('Seed user not found: ' + plan.username);",
    "  await storage.db.rooms.insert({ _id: plan.roomName, status: 'normal', active: true, sourceKeepers: false });",
    "  await storage.db['rooms.objects'].insert({",
    "    _id: plan.controller.id, type: 'controller', room: plan.roomName, x: plan.controller.x, y: plan.controller.y,",
    "    user: user._id, level: plan.controller.level, progress: 0, progressTotal: 0",
    "  });",
    "  for (const source of plan.sources) {",
    "    await storage.db['rooms.objects'].insert({ _id: source.id, type: 'source', room: plan.roomName, x: source.x, y: source.y, energy: source.energy, energyCapacity: source.energy });",
    "  }",
    "  for (const structure of plan.structures) {",
    "    const ctor = structure.type === 'spawn' ? 'StructureSpawn' : structure.type === 'tower' ? 'StructureTower' : 'StructureExtension';",
    "    await storage.db['rooms.objects'].insert({ _id: structure.id, type: structure.type, room: plan.roomName, x: structure.x, y: structure.y, user: user._id, energy: structure.energy, energyCapacity: structure.energyCapacity, name: structure.id, className: ctor });",
    "  }",
    "  await storage.db['rooms.terrain'].insert({ room: plan.roomName, terrain: '0'.repeat(2500), type: 'terrain' });",
    "  console.log(JSON.stringify({ ok: true, operation: 'seed-owned-colony', roomName: plan.roomName, structures: plan.structures.length, sources: plan.sources.length }));",
    "}).catch(error => { console.log(JSON.stringify({ ok: false, error: String(error && error.message || error) })); });"
  ].join("\n");
}

function toSerializablePlan(plan: WorldSeedPlan): Omit<WorldSeedPlan, "cliScript"> {
  return {
    name: plan.name,
    username: plan.username,
    roomName: plan.roomName,
    controller: plan.controller,
    sources: plan.sources,
    structures: plan.structures,
    storage: plan.storage
  };
}

function isRoomCoordinate(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 49;
}
