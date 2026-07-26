import type { ScenarioObservation } from "./assertions.js";

export interface TestingMemorySnapshot {
  runtime?: {
    topLevelFailures?: Array<{
      tick?: number;
      message?: string;
      error?: string;
    }>;
  };
  testing?: {
    tick: number;
    colonies: Record<string, Record<string, unknown>>;
  };
}

export function collectTestingObservationsFromMemory(
  memory: TestingMemorySnapshot,
  roomName: string
): ScenarioObservation[] {
  const colony = memory.testing?.colonies[roomName];
  if (!memory.testing || !colony) return [];

  return [
    {
      tick: memory.testing.tick,
      state: colony,
      runtimeExceptions: collectRuntimeExceptions(memory)
    }
  ];
}

function collectRuntimeExceptions(memory: TestingMemorySnapshot): string[] {
  return (memory.runtime?.topLevelFailures ?? [])
    .map((failure) => failure.message ?? failure.error)
    .filter((message): message is string => typeof message === "string" && message.length > 0);
}
