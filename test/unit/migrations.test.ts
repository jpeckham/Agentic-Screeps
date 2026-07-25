import { describe, expect, test } from "vitest";

import {
  createRootMemory,
  registerMigration,
  runMigrations
} from "../../src/memory/migration-runner.js";

describe("memory migrations", () => {
  test("empty memory initializes safely", () => {
    expect(createRootMemory({}).schemaVersion).toBe(0);
  });

  test("migrations run in order and do not rerun destructively", () => {
    const memory = createRootMemory({});
    const migrations = [
      registerMigration(1, (root) => {
        root.data["one"] = Number(root.data["one"] ?? 0) + 1;
      }),
      registerMigration(2, (root) => {
        root.data["two"] = true;
      })
    ];

    runMigrations(memory, migrations, { cpuBudget: 10 });
    runMigrations(memory, migrations, { cpuBudget: 10 });

    expect(memory.schemaVersion).toBe(2);
    expect(memory.data["one"]).toBe(1);
    expect(memory.data["two"]).toBe(true);
  });

  test("migration failure leaves recoverable state", () => {
    const memory = createRootMemory({});
    const migrations = [
      registerMigration(1, () => {
        throw new Error("cannot migrate");
      })
    ];

    const result = runMigrations(memory, migrations, { cpuBudget: 10 });

    expect(result.complete).toBe(false);
    expect(memory.schemaVersion).toBe(0);
    expect(memory.migration.lastFailure?.message).toContain("cannot migrate");
  });

  test("large migrations can resume on the next tick", () => {
    const memory = createRootMemory({});
    const migrations = [
      registerMigration(1, (root) => {
        root.data["one"] = true;
      }),
      registerMigration(2, (root) => {
        root.data["two"] = true;
      })
    ];

    expect(runMigrations(memory, migrations, { cpuBudget: 1 }).complete).toBe(
      false
    );
    expect(memory.schemaVersion).toBe(1);
    expect(runMigrations(memory, migrations, { cpuBudget: 1 }).complete).toBe(
      true
    );
    expect(memory.schemaVersion).toBe(2);
  });
});
