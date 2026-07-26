import { createHash, pbkdf2Sync } from "node:crypto";

import type { HostileInjectionPlan } from "./hostile-injection.js";
import type { WorldSeedPlan } from "./world-seeder.js";

export interface LokiResetOptions {
  roomName: string;
  botUsername: string;
  enemyUsername: string;
  botPassword?: string;
  enemyPassword?: string;
}

export interface LokiResetResult {
  removedRoomObjects: number;
  users: string[];
}

export interface LokiSeedResult {
  roomName: string;
  structures: number;
  sources: number;
}

export interface LokiHostileResult {
  roomName: string;
  hostiles: string[];
}

type LokiDb = Record<string, unknown>;
type LokiRecord = Record<string, unknown>;

interface LokiCollection {
  name: string;
  data: LokiRecord[];
  idIndex?: unknown[];
  binaryIndices?: Record<string, unknown>;
  maxId?: number;
  dirty?: boolean;
}

export function applyPrivateWorldResetToLokiDb(
  db: LokiDb,
  options: LokiResetOptions
): LokiResetResult {
  const users = collection(db, "users");
  const bot = ensureUser(users, options.botUsername);
  const enemy = ensureUser(users, options.enemyUsername);
  if (options.botPassword) setPassword(bot, options.botPassword);
  if (options.enemyPassword) setPassword(enemy, options.enemyPassword);

  const roomObjects = collection(db, "rooms.objects");
  const testUserIds = new Set([bot._id, enemy._id].map(String));
  const roomsToClear = new Set([options.roomName]);
  for (const object of roomObjects.data) {
    if (testUserIds.has(String(object.user)) && typeof object.room === "string") {
      roomsToClear.add(object.room);
    }
  }
  const removedRoomObjects = roomObjects.data.filter((object) => roomsToClear.has(String(object.room))).length;
  removeWhere(roomObjects, (object) => roomsToClear.has(String(object.room)));
  removeWhere(collection(db, "rooms.terrain"), (terrain) => roomsToClear.has(String(terrain.room)));
  removeWhere(collection(db, "rooms.flags"), (flag) => roomsToClear.has(String(flag.room)) || testUserIds.has(String(flag.user)));
  removeWhere(collection(db, "rooms"), (room) => roomsToClear.has(String(room._id)));
  removeWhere(collection(db, "users.code"), (code) => code.user === bot._id || code.user === enemy._id);
  removeWhere(collection(db, "users.console"), (entry) => entry.user === bot._id || entry.user === enemy._id);

  const env = envData(db);
  delete env[`memory:${String(bot._id)}`];
  delete env[`memory:${String(enemy._id)}`];

  touchCollections(db);
  return {
    removedRoomObjects,
    users: [String(bot.username), String(enemy.username)]
  };
}

export function applyOwnedColonySeedToLokiDb(db: LokiDb, plan: WorldSeedPlan): LokiSeedResult {
  const user = findUser(collection(db, "users"), plan.username);
  if (!user) throw new Error(`Seed user not found: ${plan.username}.`);

  const rooms = collection(db, "rooms");
  removeWhere(rooms, (room) => room._id === plan.roomName);
  insert(rooms, {
    _id: plan.roomName,
    status: "normal",
    active: true,
    sourceKeepers: false
  });

  const objects = collection(db, "rooms.objects");
  removeWhere(objects, (object) => object.room === plan.roomName);
  insert(objects, {
    _id: plan.controller.id,
    type: "controller",
    room: plan.roomName,
    x: plan.controller.x,
    y: plan.controller.y,
    user: user._id,
    level: plan.controller.level,
    progress: 0,
    progressTotal: 0
  });
  for (const source of plan.sources) {
    insert(objects, {
      _id: source.id,
      type: "source",
      room: plan.roomName,
      x: source.x,
      y: source.y,
      energy: source.energy,
      energyCapacity: source.energy
    });
  }
  for (const structure of plan.structures) {
    insert(objects, {
      _id: structure.id,
      type: structure.type,
      room: plan.roomName,
      x: structure.x,
      y: structure.y,
      user: user._id,
      energy: structure.energy,
      energyCapacity: structure.energyCapacity,
      store: { energy: structure.energy },
      storeCapacityResource: { energy: structure.energyCapacity },
      name: structure.type === "spawn" ? "Spawn1" : structure.id,
      hits: structure.type === "tower" ? 3000 : structure.type === "spawn" ? 5000 : 1000,
      hitsMax: structure.type === "tower" ? 3000 : structure.type === "spawn" ? 5000 : 1000
    });
  }

  const terrain = collection(db, "rooms.terrain");
  removeWhere(terrain, (item) => item.room === plan.roomName);
  insert(terrain, {
    _id: `${plan.roomName}-terrain`,
    room: plan.roomName,
    terrain: "0".repeat(2500),
    type: "terrain"
  });

  setMapView(db, plan.roomName, {
    w: [],
    r: [],
    pb: [],
    p: [],
    s: plan.sources.map((source) => [source.x, source.y]),
    c: [[plan.controller.x, plan.controller.y]],
    m: [],
    k: []
  });

  touchCollections(db);
  return {
    roomName: plan.roomName,
    structures: plan.structures.length,
    sources: plan.sources.length
  };
}

export function applyHostileInjectionToLokiDb(
  db: LokiDb,
  plan: HostileInjectionPlan
): LokiHostileResult {
  const enemy = findUser(collection(db, "users"), plan.enemyUsername);
  if (!enemy) throw new Error(`Enemy user not found: ${plan.enemyUsername}.`);
  const names = new Set(plan.hostileCreeps.map((hostile) => hostile.name));
  const objects = collection(db, "rooms.objects");
  removeWhere(
    objects,
    (object) => object.room === plan.roomName && object.type === "creep" && names.has(String(object.name))
  );
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
  return {
    roomName: plan.roomName,
    hostiles: [...names]
  };
}

function ensureUser(users: LokiCollection, username: string): LokiRecord {
  const existing = findUser(users, username);
  if (existing) return existing;
  return insert(users, {
    _id: stableId(username),
    username,
    usernameLower: username.toLowerCase(),
    gcl: 0,
    cpu: 100,
    active: 0
  });
}

function findUser(users: LokiCollection, username: string): LokiRecord | undefined {
  const lower = username.toLowerCase();
  return users.data.find((user) => String(user.usernameLower ?? user.username).toLowerCase() === lower);
}

function collection(db: LokiDb, name: string): LokiCollection {
  const collections = db.collections;
  if (!Array.isArray(collections)) throw new Error("Loki database is missing collections.");
  const found = collections.find((item): item is LokiCollection => isCollection(item) && item.name === name);
  if (!found) throw new Error(`Loki database is missing collection "${name}".`);
  return found;
}

function isCollection(value: unknown): value is LokiCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "data" in value &&
    Array.isArray((value as { data: unknown }).data)
  );
}

function insert(collection: LokiCollection, record: LokiRecord): LokiRecord {
  const next = {
    ...record,
    $loki: nextLokiId(collection),
    meta: {
      revision: 0,
      created: Date.now(),
      version: 0
    }
  };
  collection.data.push(next);
  rebuildCollectionIndexes(collection);
  return next;
}

function removeWhere(collection: LokiCollection, predicate: (record: LokiRecord) => boolean): void {
  collection.data = collection.data.filter((record) => !predicate(record));
  rebuildCollectionIndexes(collection);
}

function rebuildCollectionIndexes(collection: LokiCollection): void {
  collection.maxId = collection.data.reduce((max, record) => Math.max(max, Number(record.$loki) || 0), 0);
  collection.idIndex = collection.data.map((record) => record.$loki);
  collection.dirty = true;
  if (collection.binaryIndices) {
    for (const index of Object.values(collection.binaryIndices)) {
      if (typeof index === "object" && index !== null && "dirty" in index) {
        (index as { dirty: boolean }).dirty = true;
      }
    }
  }
}

function touchCollections(db: LokiDb): void {
  const collections = db.collections;
  if (!Array.isArray(collections)) return;
  for (const item of collections) {
    if (isCollection(item)) rebuildCollectionIndexes(item);
  }
}

function nextLokiId(collection: LokiCollection): number {
  return collection.data.reduce((max, record) => Math.max(max, Number(record.$loki) || 0), 0) + 1;
}

function envData(db: LokiDb): Record<string, unknown> {
  const env = collection(db, "env").data[0]?.data;
  if (typeof env !== "object" || env === null || Array.isArray(env)) {
    throw new Error("Loki env collection is missing data.");
  }
  return env as Record<string, unknown>;
}

function setMapView(db: LokiDb, roomName: string, value: unknown): void {
  envData(db)[`mapView:${roomName}`] = JSON.stringify(value);
}

function stableId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 15);
}

function setPassword(user: LokiRecord, password: string): void {
  const salt = createHash("sha256").update(`${String(user._id)}:${String(user.username)}`).digest("hex");
  user.salt = salt;
  user.password = pbkdf2Sync(Buffer.from(password), Buffer.from(salt), 25000, 512, "sha256").toString("hex");
  user.authTouched = true;
}
