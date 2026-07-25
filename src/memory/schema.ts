import type { ReleaseState } from "../runtime/release-state.js";
import type { ColonyMemory } from "../colony/colony-state.js";

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
  colonies?: Record<string, ColonyMemory>;
  config?: {
    visualsEnabled?: boolean;
  };
  creeps?: Record<string, Record<string, unknown>>;
}
