export interface WorldResetOptions {
  botUsername: string;
  enemyUsername: string;
  roomName: string;
}

export interface WorldResetPlan {
  name: "reset-private-test-world";
  roomName: string;
  operations: WorldResetOperation[];
  cliScript: string;
}

export type WorldResetOperation =
  | { kind: "removeCreeps"; roomName: string }
  | { kind: "removeStructures"; roomName: string }
  | { kind: "removeConstructionSites"; roomName: string }
  | { kind: "removeFlags"; roomName: string }
  | { kind: "removeRoomObjects"; roomName: string }
  | { kind: "clearMemory"; usernames: string[] }
  | { kind: "ensureUsers"; usernames: string[] };

export function createWorldResetPlan(options: WorldResetOptions): WorldResetPlan {
  const usernames = [options.botUsername, options.enemyUsername];
  const operations: WorldResetOperation[] = [
    { kind: "removeCreeps", roomName: options.roomName },
    { kind: "removeStructures", roomName: options.roomName },
    { kind: "removeConstructionSites", roomName: options.roomName },
    { kind: "removeFlags", roomName: options.roomName },
    { kind: "removeRoomObjects", roomName: options.roomName },
    { kind: "clearMemory", usernames },
    { kind: "ensureUsers", usernames }
  ];

  return {
    name: "reset-private-test-world",
    roomName: options.roomName,
    operations,
    cliScript: renderResetCliScript(options, operations)
  };
}

function renderResetCliScript(
  options: WorldResetOptions,
  operations: WorldResetOperation[]
): string {
  return [
    "const roomName = " + JSON.stringify(options.roomName) + ";",
    "const users = " + JSON.stringify([options.botUsername, options.enemyUsername]) + ";",
    "const operations = " + JSON.stringify(operations) + ";",
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
    "  console.log(JSON.stringify({ ok: true, operation: 'reset-private-test-world', roomName, operations }));",
    "}).catch(error => { console.log(JSON.stringify({ ok: false, error: String(error && error.message || error) })); });"
  ].join("\n");
}
