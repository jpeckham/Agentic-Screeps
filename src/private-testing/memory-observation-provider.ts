import type { ScenarioObservation } from "./assertions.js";
import {
  collectTestingObservationsFromMemory,
  type TestingMemorySnapshot
} from "./state-collector.js";

export interface MemoryReader {
  readMemory: () => Promise<Record<string, unknown>>;
}

export interface MemoryObservationProviderOptions {
  client: MemoryReader;
  roomName: string;
}

export function createMemoryObservationProvider(
  options: MemoryObservationProviderOptions
): () => Promise<ScenarioObservation[]> {
  return async () => {
    const memory = await options.client.readMemory();
    return collectTestingObservationsFromMemory(memory as TestingMemorySnapshot, options.roomName);
  };
}
