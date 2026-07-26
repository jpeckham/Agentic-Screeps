import { createRootMemory, registerMigration, runMigrations } from "./migration-runner.js";

export const migrations = [
  registerMigration(1, (memory) => {
    memory.data["initializedAt"] ??= 0;
  }),
  registerMigration(2, (memory) => {
    memory.colonies ??= {};
    memory.config ??= { visualsEnabled: true };
  }),
  registerMigration(3, (memory) => {
    memory.colonies ??= {};
    for (const colony of Object.values(memory.colonies)) {
      colony.defense ??= { posture: "peace", enteredAt: 0 };
    }
  }),
  registerMigration(4, (memory) => {
    memory.colonies ??= {};
    for (const colony of Object.values(memory.colonies)) {
      if (!colony.defense) continue;
      if (colony.defense.pendingPosture === undefined || colony.defense.pendingSince === undefined) {
        delete colony.defense.pendingPosture;
        delete colony.defense.pendingSince;
      }
    }
  })
];

export function migrateMemory(memory: Record<string, unknown>): void {
  const root = createRootMemory(memory);
  runMigrations(root, migrations, { cpuBudget: 1 });
}
