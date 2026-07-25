import type { ReleaseState } from "../runtime/release-state.js";

export interface MigrationMemory {
  applied: number[];
  inProgress?: number;
  lastFailure?: {
    version: number;
    message: string;
  };
}

export interface RootMemory {
  schemaVersion: number;
  runtime?: ReleaseState;
  migration: MigrationMemory;
  data: Record<string, unknown>;
}
