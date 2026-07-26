import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash, pbkdf2Sync } from "node:crypto";
import { join } from "node:path";

import {
  getPrivateServerStatus,
  loadProjectEnvironment,
  readPrivateServerConfig,
  runPrivateServerCommand
} from "./private-screeps.mjs";

const officialHosts = new Set(["screeps.com", "www.screeps.com", "screeps-world.com", "screepsarena.com"]);

const command = process.argv[2];
const printOnly = process.argv.includes("--print");

if (command !== "reset" && command !== "seed" && command !== "hostiles") {
  console.error("Use reset, seed, or hostiles <scenario-name>.");
  process.exitCode = 2;
} else {
  try {
    const env = await loadProjectEnvironment();
    const config = readConfig(env);
    const script =
      command === "reset"
        ? createResetScript(config)
        : command === "seed"
          ? createSeedScript(config)
          : createHostileScript(config, await loadScenario(config, getScenarioName()));
    if (printOnly) {
      console.log(script);
    } else {
      await runLokiMutation(command, config);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.replace(/[A-Za-z0-9_-]{16,}/g, "[redacted]"));
    process.exitCode = 1;
  }
}

function readConfig(env) {
  if (env.SCREEPS_TARGET !== "private") {
    throw new Error("Private world commands require SCREEPS_TARGET=private.");
  }
  if (env.SCREEPS_PRIVATE_TESTING !== "true") {
    throw new Error("Private world commands require SCREEPS_PRIVATE_TESTING=true.");
  }
  const protocol = (env.SCREEPS_PRIVATE_PROTOCOL || "http").replace(/:$/, "");
  const host = (env.SCREEPS_PRIVATE_HOST || "127.0.0.1").trim().replace(/\/+$/, "");
  const port = Number(env.SCREEPS_PRIVATE_PORT || 21025);
  const endpoint = `${protocol}://${host}:${port}`;
  if (isOfficialEndpoint(endpoint)) {
    throw new Error("Private world commands refuse to target an official Screeps endpoint.");
  }
  return {
    endpoint,
    roomName: env.SCREEPS_PRIVATE_ROOM || "W1N1",
    username: env.SCREEPS_PRIVATE_USERNAME || "agentic-bot",
    password: env.SCREEPS_PRIVATE_PASSWORD || "agentic-local-password",
    enemyUsername: env.SCREEPS_PRIVATE_ENEMY_USERNAME || "agentic-enemy",
    enemyPassword: env.SCREEPS_PRIVATE_ENEMY_PASSWORD || "agentic-enemy-password",
    scenarioDir: env.SCREEPS_PRIVATE_SCENARIO_DIR || "test/scenarios/definitions",
    dataDir: env.SCREEPS_PRIVATE_DATA_DIR || ".screeps-private",
    composeProject: env.SCREEPS_PRIVATE_COMPOSE_PROJECT || "agentic-screeps-private"
  };
}

function createResetScript(config) {
  const users = [config.username, config.enemyUsername];
  return [
    `const roomName = ${JSON.stringify(config.roomName)};`,
    `const users = ${JSON.stringify(users)};`,
    "Promise.resolve().then(async () => {",
    "  for (const username of users) {",
    "    const existing = await storage.db.users.findOne({ username });",
    "    if (!existing) await storage.db.users.insert({ username });",
    "    await storage.db['users.code'].remove({ user: username });",
    "    await storage.db['users.console'].remove({ user: username });",
    "    await storage.db['users.memory'].remove({ user: username });",
    "  }",
    "  await storage.db.creeps.remove({ room: roomName });",
    "  await storage.db['rooms.objects'].remove({ room: roomName });",
    "  await storage.db['rooms.flags'].remove({ room: roomName });",
    "  await storage.db['rooms.terrain'].remove({ room: roomName });",
    "  await storage.db.rooms.remove({ _id: roomName });",
    "  console.log(JSON.stringify({ ok: true, operation: 'reset-private-test-world', roomName }));",
    "}).catch(error => { console.log(JSON.stringify({ ok: false, error: String(error && error.message || error) })); });"
  ].join("\n");
}

function createSeedScript(config) {
  const plan = createSeedPlan(config);
  return [
    `const plan = ${JSON.stringify(plan)};`,
    "Promise.resolve().then(async () => {",
    "  const user = await storage.db.users.findOne({ username: plan.username });",
    "  if (!user) throw new Error('Seed user not found: ' + plan.username);",
    "  await storage.db.rooms.insert({ _id: plan.roomName, status: 'normal', active: true, sourceKeepers: false });",
    "  await storage.db['rooms.objects'].insert({ _id: plan.controller.id, type: 'controller', room: plan.roomName, x: plan.controller.x, y: plan.controller.y, user: user._id, level: plan.controller.level, progress: 0, progressTotal: 0 });",
    "  for (const source of plan.sources) await storage.db['rooms.objects'].insert({ _id: source.id, type: 'source', room: plan.roomName, x: source.x, y: source.y, energy: source.energy, energyCapacity: source.energy });",
    "  for (const structure of plan.structures) {",
    "    const className = structure.type === 'spawn' ? 'StructureSpawn' : structure.type === 'tower' ? 'StructureTower' : 'StructureExtension';",
    "    await storage.db['rooms.objects'].insert({ _id: structure.id, type: structure.type, room: plan.roomName, x: structure.x, y: structure.y, user: user._id, energy: structure.energy, energyCapacity: structure.energyCapacity, name: structure.id, className });",
    "  }",
    "  await storage.db['rooms.terrain'].insert({ room: plan.roomName, terrain: '0'.repeat(2500), type: 'terrain' });",
    "  console.log(JSON.stringify({ ok: true, operation: 'seed-owned-colony', roomName: plan.roomName, structures: plan.structures.length, sources: plan.sources.length }));",
    "}).catch(error => { console.log(JSON.stringify({ ok: false, error: String(error && error.message || error) })); });"
  ].join("\n");
}

function createSeedPlan(config) {
  const roomName = config.roomName;
  return {
    username: config.username,
    roomName,
    controller: { id: `${roomName}-controller`, x: 25, y: 20, level: 3 },
    sources: [
      { id: `${roomName}-source-1`, x: 18, y: 22, energy: 3000 },
      { id: `${roomName}-source-2`, x: 32, y: 28, energy: 3000 }
    ],
    structures: [
      { id: `${roomName}-spawn-1`, type: "spawn", x: 25, y: 25, energy: 300, energyCapacity: 300 },
      { id: `${roomName}-tower-1`, type: "tower", x: 23, y: 25, energy: 500, energyCapacity: 1000 },
      { id: `${roomName}-extension-1`, type: "extension", x: 24, y: 24, energy: 50, energyCapacity: 50 },
      { id: `${roomName}-extension-2`, type: "extension", x: 26, y: 24, energy: 50, energyCapacity: 50 },
      { id: `${roomName}-extension-3`, type: "extension", x: 24, y: 26, energy: 50, energyCapacity: 50 },
      { id: `${roomName}-extension-4`, type: "extension", x: 26, y: 26, energy: 50, energyCapacity: 50 },
      { id: `${roomName}-extension-5`, type: "extension", x: 25, y: 27, energy: 50, energyCapacity: 50 }
    ]
  };
}

async function loadScenario(config, scenarioName) {
  const scenarioPath = join(process.cwd(), config.scenarioDir, `${scenarioName}.json`);
  const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));
  if (!scenario || typeof scenario !== "object" || scenario.name !== scenarioName) {
    throw new Error(`Scenario file ${scenarioPath} does not define ${scenarioName}.`);
  }
  if (!Array.isArray(scenario.hostileCreeps)) {
    throw new Error(`Scenario ${scenarioName} must define hostileCreeps.`);
  }
  return scenario;
}

function getScenarioName() {
  const scenarioName = process.argv.slice(3).find((arg) => !arg.startsWith("--"));
  if (!scenarioName) throw new Error("Hostile seeding requires a scenario name.");
  return scenarioName;
}

function createHostileScript(config, scenario) {
  const plan = createHostilePlan(config, scenario);
  return [
    `const plan = ${JSON.stringify(plan)};`,
    "Promise.resolve().then(async () => {",
    "  let enemy = await storage.db.users.findOne({ username: plan.enemyUsername });",
    "  if (!enemy) enemy = await storage.db.users.insert({ username: plan.enemyUsername });",
    "  const names = plan.hostileCreeps.map(hostile => hostile.name);",
    "  await storage.db.creeps.remove({ room: plan.roomName, name: { $in: names } });",
    "  await storage.db['rooms.objects'].remove({ room: plan.roomName, type: 'creep', name: { $in: names } });",
    "  for (const hostile of plan.hostileCreeps) {",
    "    await storage.db['rooms.objects'].insert({",
    "      _id: hostile.id, type: 'creep', room: hostile.roomName, x: hostile.x, y: hostile.y,",
    "      user: enemy._id, name: hostile.name,",
    "      body: hostile.body.map(type => ({ type, hits: 100 })),",
    "      hits: hostile.hits, hitsMax: hostile.hitsMax, spawning: false, fatigue: 0, testAction: hostile.action",
    "    });",
    "  }",
    "  console.log(JSON.stringify({ ok: true, operation: 'seed-hostiles', scenarioName: plan.scenarioName, roomName: plan.roomName, hostiles: names }));",
    "}).catch(error => { console.log(JSON.stringify({ ok: false, error: String(error && error.message || error) })); });"
  ].join("\n");
}

function createHostilePlan(config, scenario) {
  return {
    name: "hostile-fixtures",
    scenarioName: scenario.name,
    enemyUsername: config.enemyUsername,
    roomName: config.roomName,
    hostileCreeps: scenario.hostileCreeps.map((hostile) => createHostileRecord(scenario.name, config.roomName, hostile))
  };
}

function createHostileRecord(scenarioName, roomName, hostile) {
  if (!hostile || typeof hostile !== "object") throw new Error("Hostile fixture must be an object.");
  if (!isNonEmptyString(hostile.name)) throw new Error("Hostile name must be non-empty.");
  if (hostile.roomName !== roomName) throw new Error(`Hostile ${hostile.name} must target room ${roomName}.`);
  if (!Array.isArray(hostile.body) || hostile.body.length === 0) throw new Error(`Hostile ${hostile.name} body must be non-empty.`);
  for (const part of hostile.body) {
    if (!isValidBodyPart(part)) throw new Error(`Hostile ${hostile.name} has invalid body part ${String(part)}.`);
  }
  if (!isRoomCoordinate(hostile.x) || !isRoomCoordinate(hostile.y)) throw new Error(`Hostile ${hostile.name} has invalid coordinates.`);
  const action = hostile.action || "hold";
  if (!["hold", "approachSpawn", "attackSpawn"].includes(action)) throw new Error(`Hostile ${hostile.name} action is unsupported.`);
  const hitsMax = hostile.body.length * 100;
  const hits = hostile.hits || hitsMax;
  if (!Number.isInteger(hits) || hits < 1) throw new Error(`Hostile ${hostile.name} hits must be positive.`);
  if (hits > hitsMax) throw new Error(`Hostile ${hostile.name} hits cannot exceed hitsMax.`);
  return {
    id: `${roomName}-hostile-${slugify(scenarioName)}-${slugify(hostile.name)}`,
    name: hostile.name,
    body: hostile.body,
    hits,
    hitsMax,
    roomName,
    x: hostile.x,
    y: hostile.y,
    action
  };
}

async function runLokiMutation(command, config) {
  const scenario = command === "hostiles" ? await loadScenario(config, getScenarioName()) : undefined;
  await runPrivateServerCommand(["stop"], { env: await loadProjectEnvironment() });
  const dbPath = join(config.dataDir, "db.json");
  await copyFile(dbPath, join(config.dataDir, "db.before-private-world-command.json"));
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  const result =
    command === "reset"
      ? mutateReset(db, config)
      : command === "seed"
        ? mutateSeed(db, config)
        : mutateHostiles(db, config, scenario);
  await writeFile(dbPath, `${JSON.stringify(db)}\n`, "utf8");
  await runPrivateServerCommand(["start"], { env: await loadProjectEnvironment() });
  const status = await waitUntilReady(config);
  console.log(JSON.stringify({ ok: true, ...result, running: status.running, tick: status.tick }));
}

async function waitUntilReady(config) {
  const serverConfig = readPrivateServerConfig(await loadProjectEnvironment());
  const deadline = Date.now() + 60_000;
  let status = await getPrivateServerStatus({ config: serverConfig });
  while (!status.running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    status = await getPrivateServerStatus({ config: serverConfig });
  }
  if (!status.running) throw new Error(`Private server did not become ready after ${config.operation || "world mutation"}.`);
  return status;
}

function mutateReset(db, config) {
  const bot = ensureUser(db, config.username);
  const enemy = ensureUser(db, config.enemyUsername);
  setPassword(bot, config.password);
  setPassword(enemy, config.enemyPassword);
  const testUserIds = new Set([bot._id, enemy._id].map(String));
  const roomsToClear = new Set([config.roomName]);
  const roomObjects = collection(db, "rooms.objects");
  for (const object of roomObjects.data) {
    if (testUserIds.has(String(object.user)) && typeof object.room === "string") {
      roomsToClear.add(object.room);
    }
  }
  removeWhere(roomObjects, (object) => roomsToClear.has(String(object.room)));
  removeWhere(collection(db, "rooms.terrain"), (terrain) => roomsToClear.has(String(terrain.room)));
  removeWhere(collection(db, "rooms.flags"), (flag) => roomsToClear.has(String(flag.room)) || testUserIds.has(String(flag.user)));
  removeWhere(collection(db, "rooms"), (room) => roomsToClear.has(String(room._id)));
  removeWhere(collection(db, "users.code"), (code) => code.user === bot._id || code.user === enemy._id);
  removeWhere(collection(db, "users.console"), (entry) => entry.user === bot._id || entry.user === enemy._id);
  const env = envData(db);
  delete env[`memory:${bot._id}`];
  delete env[`memory:${enemy._id}`];
  touchCollections(db);
  return { operation: "reset-private-test-world", roomName: config.roomName };
}

function mutateSeed(db, config) {
  const plan = createSeedPlan(config);
  const user = findUser(db, config.username);
  if (!user) throw new Error(`Seed user not found: ${config.username}`);
  removeWhere(collection(db, "rooms"), (room) => room._id === config.roomName);
  insert(collection(db, "rooms"), { _id: config.roomName, status: "normal", active: true, sourceKeepers: false });
  const objects = collection(db, "rooms.objects");
  removeWhere(objects, (object) => object.room === config.roomName);
  insert(objects, { _id: plan.controller.id, type: "controller", room: config.roomName, x: plan.controller.x, y: plan.controller.y, user: user._id, level: plan.controller.level, progress: 0, progressTotal: 0 });
  for (const source of plan.sources) insert(objects, { _id: source.id, type: "source", room: config.roomName, x: source.x, y: source.y, energy: source.energy, energyCapacity: source.energy });
  for (const structure of plan.structures) {
    insert(objects, {
      _id: structure.id,
      type: structure.type,
      room: config.roomName,
      x: structure.x,
      y: structure.y,
      user: user._id,
      energy: structure.energy,
      energyCapacity: structure.energyCapacity,
      store: { energy: structure.energy },
      storeCapacityResource: { energy: structure.energyCapacity },
      name: structure.type === "spawn" ? "Spawn1" : structure.id,
      hits: structure.type === "spawn" ? 5000 : structure.type === "tower" ? 3000 : 1000,
      hitsMax: structure.type === "spawn" ? 5000 : structure.type === "tower" ? 3000 : 1000
    });
  }
  removeWhere(collection(db, "rooms.terrain"), (terrain) => terrain.room === config.roomName);
  insert(collection(db, "rooms.terrain"), { _id: `${config.roomName}-terrain`, room: config.roomName, terrain: "0".repeat(2500), type: "terrain" });
  envData(db)[`mapView:${config.roomName}`] = JSON.stringify({ w: [], r: [], pb: [], p: [], s: plan.sources.map((source) => [source.x, source.y]), c: [[plan.controller.x, plan.controller.y]], m: [], k: [] });
  touchCollections(db);
  return { operation: "seed-owned-colony", roomName: config.roomName, structures: plan.structures.length, sources: plan.sources.length };
}

function mutateHostiles(db, config, scenario) {
  const enemy = findUser(db, config.enemyUsername);
  if (!enemy) throw new Error(`Enemy user not found: ${config.enemyUsername}`);
  const plan = createHostilePlan(config, scenario);
  const names = new Set(plan.hostileCreeps.map((hostile) => hostile.name));
  const objects = collection(db, "rooms.objects");
  removeWhere(objects, (object) => object.room === config.roomName && object.type === "creep" && names.has(String(object.name)));
  for (const hostile of plan.hostileCreeps) {
    insert(objects, {
      _id: hostile.id,
      type: "creep",
      room: hostile.roomName,
      x: hostile.x,
      y: hostile.y,
      user: enemy._id,
      name: hostile.name,
      body: hostile.body.map((type) => ({ type, hits: 100 })),
      hits: hostile.hits,
      hitsMax: hostile.hitsMax,
      spawning: false,
      fatigue: 0,
      testAction: hostile.action
    });
  }
  touchCollections(db);
  return { operation: "seed-hostiles", scenarioName: scenario.name, roomName: config.roomName, hostiles: [...names] };
}

function collection(db, name) {
  const found = db.collections?.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Loki database is missing collection "${name}".`);
  return found;
}

function envData(db) {
  const data = collection(db, "env").data[0]?.data;
  if (!data) throw new Error("Loki database is missing env data.");
  return data;
}

function findUser(db, username) {
  const lower = username.toLowerCase();
  return collection(db, "users").data.find((user) => String(user.usernameLower || user.username).toLowerCase() === lower);
}

function ensureUser(db, username) {
  const existing = findUser(db, username);
  if (existing) return existing;
  return insert(collection(db, "users"), {
    _id: stableId(username),
    username,
    usernameLower: username.toLowerCase(),
    gcl: 0,
    cpu: 100,
    active: 0
  });
}

function insert(col, record) {
  const next = { ...record, $loki: nextLokiId(col), meta: { revision: 0, created: Date.now(), version: 0 } };
  col.data.push(next);
  rebuildCollection(col);
  return next;
}

function removeWhere(col, predicate) {
  col.data = col.data.filter((record) => !predicate(record));
  rebuildCollection(col);
}

function nextLokiId(col) {
  return col.data.reduce((max, record) => Math.max(max, Number(record.$loki) || 0), 0) + 1;
}

function touchCollections(db) {
  for (const col of db.collections || []) rebuildCollection(col);
}

function rebuildCollection(col) {
  col.maxId = col.data.reduce((max, record) => Math.max(max, Number(record.$loki) || 0), 0);
  col.idIndex = col.data.map((record) => record.$loki);
  col.dirty = true;
  for (const index of Object.values(col.binaryIndices || {})) {
    if (index && typeof index === "object" && "dirty" in index) index.dirty = true;
  }
}

function stableId(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash).toString(16).padStart(8, "0") + value.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 7);
}

function setPassword(user, password) {
  const salt = createHash("sha256").update(`${String(user._id)}:${String(user.username)}`).digest("hex");
  user.salt = salt;
  user.password = pbkdf2Sync(Buffer.from(password), Buffer.from(salt), 25000, 512, "sha256").toString("hex");
  user.authTouched = true;
}

function isOfficialEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    parsed = new URL(`https://${endpoint}`);
  }
  return officialHosts.has(parsed.hostname.toLowerCase());
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRoomCoordinate(value) {
  return Number.isInteger(value) && value >= 0 && value <= 49;
}

function isValidBodyPart(value) {
  return ["move", "work", "carry", "attack", "ranged_attack", "heal", "tough", "claim"].includes(value);
}

function slugify(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
