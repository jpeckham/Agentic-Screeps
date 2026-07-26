import { describe, expect, test } from "vitest";

import {
  applyHostileInjectionToLokiDb,
  applyOwnedColonySeedToLokiDb,
  applyPrivateWorldResetToLokiDb
} from "../../src/private-testing/loki-world-editor.js";
import { createHostileInjectionPlan } from "../../src/private-testing/hostile-injection.js";
import { createOwnedColonySeedPlan } from "../../src/private-testing/world-seeder.js";

describe("private Loki world editor", () => {
  test("resets the test room, clears bot state, and ensures test users", () => {
    const db = createMinimalDb();

    const result = applyPrivateWorldResetToLokiDb(db, {
      roomName: "W1N1",
      botUsername: "agentic-bot",
      enemyUsername: "agentic-enemy",
      botPassword: "local-password",
      enemyPassword: "enemy-password"
    });

    expect(result.removedRoomObjects).toBe(3);
    expect(collection(db, "rooms.objects").data).toEqual([]);
    expect(collection(db, "rooms.terrain").data).toEqual([]);
    expect(collection(db, "rooms.flags").data).toEqual([]);
    expect(collection(db, "rooms").data).toEqual([]);
    expect(collection(db, "users.code").data).toEqual([]);
    expect(envData(db)["memory:bot-id"]).toBeUndefined();
    expect(collection(db, "users").data.map((user) => user.username)).toEqual([
      "agentic-bot",
      "agentic-enemy"
    ]);
    expect(collection(db, "users").data[0]).toEqual(
      expect.objectContaining({ password: expect.any(String), salt: expect.any(String) })
    );
  });

  test("seeds an owned colony and hostile fixtures into Loki storage", () => {
    const db = createMinimalDb();
    applyPrivateWorldResetToLokiDb(db, {
      roomName: "W1N1",
      botUsername: "agentic-bot",
      enemyUsername: "agentic-enemy",
      botPassword: "local-password",
      enemyPassword: "enemy-password"
    });

    const seed = applyOwnedColonySeedToLokiDb(
      db,
      createOwnedColonySeedPlan({ username: "agentic-bot", roomName: "W1N1" })
    );
    const hostile = applyHostileInjectionToLokiDb(
      db,
      createHostileInjectionPlan({
        enemyUsername: "agentic-enemy",
        roomName: "W1N1",
        scenario: {
          name: "melee-attacker",
          description: "test",
          initialState: { baseline: "owned-colony" },
          durationTicks: 3,
          hostileCreeps: [
            {
              name: "attacker-1",
              body: ["move", "attack"],
              roomName: "W1N1",
              x: 24,
              y: 25
            }
          ],
          assertions: [{ type: "noRuntimeException", label: "loop runs" }]
        }
      })
    );

    expect(seed.structures).toBe(7);
    expect(hostile.hostiles).toEqual(["attacker-1"]);
    expect(collection(db, "rooms").data).toContainEqual(expect.objectContaining({ _id: "W1N1" }));
    expect(collection(db, "rooms.terrain").data).toContainEqual(expect.objectContaining({ room: "W1N1" }));
    const enemy = collection(db, "users").data.find((user) => user.username === "agentic-enemy")!;
    expect(collection(db, "rooms.objects").data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "controller", room: "W1N1", user: "bot-id", level: 3 }),
        expect.objectContaining({ type: "spawn", room: "W1N1", user: "bot-id" }),
        expect.objectContaining({ type: "tower", room: "W1N1", user: "bot-id" }),
        expect.objectContaining({ type: "creep", room: "W1N1", user: enemy._id, name: "attacker-1" })
      ])
    );
    expect(collection(db, "rooms.objects").idIndex.length).toBe(collection(db, "rooms.objects").data.length);
  });
});

function createMinimalDb(): Record<string, unknown> {
  return {
    collections: [
      createCollection("env", [
        { data: { "memory:bot-id": "{}", gameTime: 10 }, $loki: 1, meta: {} }
      ]),
      createCollection("users", [
        { _id: "bot-id", username: "agentic-bot", usernameLower: "agentic-bot", $loki: 1, meta: {} }
      ]),
      createCollection("rooms", [
        { _id: "W1N1", status: "normal", $loki: 1, meta: {} },
        { _id: "E1S1", status: "normal", $loki: 2, meta: {} }
      ]),
      createCollection("rooms.objects", [
        { _id: "old-spawn", room: "W1N1", type: "spawn", user: "bot-id", $loki: 1, meta: {} },
        { _id: "old-creep", room: "W1N1", type: "creep", user: "bot-id", $loki: 2, meta: {} },
        { _id: "stale-spawn", room: "E1S1", type: "spawn", user: "bot-id", $loki: 3, meta: {} }
      ]),
      createCollection("rooms.terrain", [
        { _id: "old-terrain", room: "W1N1", terrain: "0", $loki: 1, meta: {} },
        { _id: "stale-terrain", room: "E1S1", terrain: "0", $loki: 2, meta: {} }
      ]),
      createCollection("rooms.flags", [
        { _id: "old-flag", room: "W1N1", user: "bot-id", $loki: 1, meta: {} },
        { _id: "stale-flag", room: "E1S1", user: "bot-id", $loki: 2, meta: {} }
      ]),
      createCollection("users.code", [{ _id: "old-code", user: "bot-id", modules: {}, $loki: 1, meta: {} }]),
      createCollection("users.console", [{ _id: "old-console", user: "bot-id", $loki: 1, meta: {} }])
    ]
  };
}

function createCollection(name: string, data: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    name,
    data,
    idIndex: data.map((item) => item.$loki),
    binaryIndices: {},
    uniqueNames: ["_id"],
    maxId: data.length
  };
}

function collection(db: Record<string, unknown>, name: string): { data: Array<Record<string, unknown>>; idIndex: unknown[] } {
  const collections = db.collections as Array<{ name: string; data: Array<Record<string, unknown>>; idIndex: unknown[] }>;
  const found = collections.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing collection ${name}`);
  return found;
}

function envData(db: Record<string, unknown>): Record<string, unknown> {
  return collection(db, "env").data[0]!.data as Record<string, unknown>;
}
