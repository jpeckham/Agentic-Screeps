import type { RootMemory } from "./schema.js";

export interface Migration {
  version: number;
  run(memory: RootMemory): void;
}

export interface MigrationResult {
  complete: boolean;
  appliedThisTick: number[];
}

export function createRootMemory(memory: Record<string, unknown>): RootMemory {
  memory["schemaVersion"] ??= 0;
  memory["migration"] ??= { applied: [] };
  memory["data"] ??= {};
  const root = memory as unknown as RootMemory;
  root.migration.applied ??= [];
  return root;
}

export function registerMigration(
  version: number,
  run: (memory: RootMemory) => void
): Migration {
  return { version, run };
}

export function runMigrations(
  memory: RootMemory,
  migrations: Migration[],
  options: { cpuBudget: number }
): MigrationResult {
  const ordered = [...migrations].sort((left, right) => left.version - right.version);
  const appliedThisTick: number[] = [];
  let budget = options.cpuBudget;

  for (const migration of ordered) {
    if (migration.version <= memory.schemaVersion || budget <= 0) {
      continue;
    }

    try {
      memory.migration.inProgress = migration.version;
      migration.run(memory);
      memory.schemaVersion = migration.version;
      memory.migration.applied.push(migration.version);
      delete memory.migration.inProgress;
      delete memory.migration.lastFailure;
      appliedThisTick.push(migration.version);
      budget -= 1;
    } catch (error) {
      memory.migration.lastFailure = {
        version: migration.version,
        message: error instanceof Error ? error.message : String(error)
      };
      delete memory.migration.inProgress;
      return { complete: false, appliedThisTick };
    }
  }

  const complete = ordered.every((migration) => migration.version <= memory.schemaVersion);
  return { complete, appliedThisTick };
}
