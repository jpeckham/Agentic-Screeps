import type { ColonyMemory, ColonyRootMemory } from "./colony-state.js";

export interface AiConsole {
  status(roomName?: string): unknown;
  setVisuals(enabled: boolean): void;
  forceReplan(roomName?: string): void;
}

export function createAiConsole(memory: ColonyRootMemory): AiConsole {
  return {
    status(roomName?: string): unknown {
      const colonies = memory.colonies ?? {};
      if (roomName) return colonies[roomName] ?? { error: "unknown colony", roomName };
      return Object.values(colonies).map(formatStatus);
    },
    setVisuals(enabled: boolean): void {
      memory.config ??= {};
      memory.config.visualsEnabled = enabled;
    },
    forceReplan(roomName?: string): void {
      const colonies = memory.colonies ?? {};
      for (const colony of Object.values(colonies)) {
        if (!roomName || colony.roomName === roomName) colony.forceReplan = true;
      }
    }
  };
}

function formatStatus(colony: ColonyMemory): unknown {
  return {
    roomName: colony.roomName,
    rcl: colony.lastKnownRcl,
    emergency: colony.emergency,
    workforceTarget: colony.workforceTarget,
    lastPlanTick: colony.lastPlanTick
  };
}
