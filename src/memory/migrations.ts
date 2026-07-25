import { createRootMemory, registerMigration, runMigrations } from "./migration-runner.js";

export const migrations = [
  registerMigration(1, (memory) => {
    memory.data["initializedAt"] ??= 0;
  })
];

export function migrateMemory(memory: Record<string, unknown>): void {
  const root = createRootMemory(memory);
  runMigrations(root, migrations, { cpuBudget: 1 });
}
