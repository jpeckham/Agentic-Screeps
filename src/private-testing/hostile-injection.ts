import type { BodyPartName, CombatScenario, HostileCreepFixture } from "./scenarios.js";

export interface HostileInjectionOptions {
  scenario: CombatScenario;
  enemyUsername: string;
  roomName: string;
}

export interface HostileInjectionPlan {
  name: "hostile-fixtures";
  scenarioName: string;
  enemyUsername: string;
  roomName: string;
  hostileCreeps: HostileCreepRecord[];
  cliScript: string;
}

export interface HostileCreepRecord {
  id: string;
  name: string;
  body: BodyPartName[];
  hits: number;
  hitsMax: number;
  roomName: string;
  x: number;
  y: number;
  action: "hold" | "approachSpawn" | "attackSpawn";
}

const VALID_BODY_PARTS = new Set<BodyPartName>([
  "move",
  "work",
  "carry",
  "attack",
  "ranged_attack",
  "heal",
  "tough",
  "claim"
]);

const VALID_ACTIONS = new Set(["hold", "approachSpawn", "attackSpawn"]);
const BODY_PART_HITS = 100;

export function createHostileInjectionPlan(options: HostileInjectionOptions): HostileInjectionPlan {
  validatePlanOptions(options);
  const hostileCreeps = options.scenario.hostileCreeps.map((hostile) =>
    createHostileRecord(options.scenario.name, options.roomName, hostile)
  );
  const plan: HostileInjectionPlan = {
    name: "hostile-fixtures",
    scenarioName: options.scenario.name,
    enemyUsername: options.enemyUsername,
    roomName: options.roomName,
    hostileCreeps,
    cliScript: ""
  };

  return {
    ...plan,
    cliScript: renderHostileInjectionCliScript(plan)
  };
}

function validatePlanOptions(options: HostileInjectionOptions): void {
  if (!isNonEmptyString(options.enemyUsername)) throw new Error("Enemy username must be non-empty.");
  if (!isNonEmptyString(options.roomName)) throw new Error("Room name must be non-empty.");
  if (!isNonEmptyString(options.scenario.name)) throw new Error("Scenario name must be non-empty.");
}

function createHostileRecord(
  scenarioName: string,
  roomName: string,
  hostile: HostileCreepFixture
): HostileCreepRecord {
  if (!isNonEmptyString(hostile.name)) throw new Error("Hostile name must be non-empty.");
  if (hostile.roomName !== roomName) {
    throw new Error(`Hostile ${hostile.name} must target room ${roomName}.`);
  }
  if (!Array.isArray(hostile.body) || hostile.body.length === 0) {
    throw new Error(`Hostile ${hostile.name} body must be non-empty.`);
  }
  for (const part of hostile.body) {
    if (!VALID_BODY_PARTS.has(part)) throw new Error(`Hostile ${hostile.name} has invalid body part ${part}.`);
  }
  if (!isRoomCoordinate(hostile.x) || !isRoomCoordinate(hostile.y)) {
    throw new Error(`Hostile ${hostile.name} has invalid coordinates.`);
  }
  if (hostile.action !== undefined && !VALID_ACTIONS.has(hostile.action)) {
    throw new Error(`Hostile ${hostile.name} action is unsupported.`);
  }

  const hitsMax = hostile.body.length * BODY_PART_HITS;
  const hits = hostile.hits ?? hitsMax;
  if (!Number.isInteger(hits) || hits < 1) throw new Error(`Hostile ${hostile.name} hits must be positive.`);
  if (hits > hitsMax) throw new Error(`Hostile ${hostile.name} hits cannot exceed hitsMax.`);

  return {
    id: `${roomName}-hostile-${slugify(scenarioName)}-${slugify(hostile.name)}`,
    name: hostile.name,
    body: [...hostile.body],
    hits,
    hitsMax,
    roomName,
    x: hostile.x,
    y: hostile.y,
    action: hostile.action ?? "hold"
  };
}

function renderHostileInjectionCliScript(plan: HostileInjectionPlan): string {
  return [
    "const plan = " + JSON.stringify(toSerializablePlan(plan)) + ";",
    "Promise.resolve().then(async () => {",
    "  let enemy = await storage.db.users.findOne({ username: plan.enemyUsername });",
    "  if (!enemy) enemy = await storage.db.users.insert({ username: plan.enemyUsername });",
    "  const names = plan.hostileCreeps.map(hostile => hostile.name);",
    "  await storage.db.creeps.remove({ room: plan.roomName, name: { $in: names } });",
    "  await storage.db['rooms.objects'].remove({ room: plan.roomName, type: 'creep', name: { $in: names } });",
    "  for (const hostile of plan.hostileCreeps) {",
    "    await storage.db['rooms.objects'].insert({",
    "      _id: hostile.id,",
    "      type: 'creep',",
    "      room: hostile.roomName,",
    "      x: hostile.x,",
    "      y: hostile.y,",
    "      user: enemy._id,",
    "      name: hostile.name,",
    "      body: hostile.body.map(type => ({ type, hits: 100 })),",
    "      hits: hostile.hits,",
    "      hitsMax: hostile.hitsMax,",
    "      spawning: false,",
    "      fatigue: 0,",
    "      testAction: hostile.action",
    "    });",
    "  }",
    "  console.log(JSON.stringify({ ok: true, operation: 'seed-hostiles', scenarioName: plan.scenarioName, roomName: plan.roomName, hostiles: names }));",
    "}).catch(error => { console.log(JSON.stringify({ ok: false, error: String(error && error.message || error) })); });"
  ].join("\n");
}

function toSerializablePlan(plan: HostileInjectionPlan): Omit<HostileInjectionPlan, "cliScript"> {
  return {
    name: plan.name,
    scenarioName: plan.scenarioName,
    enemyUsername: plan.enemyUsername,
    roomName: plan.roomName,
    hostileCreeps: plan.hostileCreeps
  };
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function isRoomCoordinate(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 49;
}
