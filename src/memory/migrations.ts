import { createRootMemory, registerMigration, runMigrations } from "./migration-runner.js";

export const migrations = [
  registerMigration(1, (memory) => {
    memory.data["initializedAt"] ??= 0;
  }),
  registerMigration(2, (memory) => {
    memory.colonies ??= {};
    memory.config ??= { visualsEnabled: true };
  })
];

export function migrateMemory(memory: Record<string, unknown>): void {
  const root = createRootMemory(memory);
  runMigrations(root, migrations, { cpuBudget: 1 });
}
