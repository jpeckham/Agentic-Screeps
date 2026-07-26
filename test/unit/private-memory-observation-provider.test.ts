import { describe, expect, test, vi } from "vitest";

import { createMemoryObservationProvider } from "../../src/private-testing/memory-observation-provider.js";

describe("private Memory observation provider", () => {
  test("reads private Memory and converts testing telemetry into observations", async () => {
    const readMemory = vi.fn().mockResolvedValue({
      testing: {
        tick: 42,
        colonies: {
          E1S1: {
            threat: "LOW",
            posture: "ALERT",
            tower: { action: "hold" }
          }
        }
      },
      runtime: {
        topLevelFailures: [{ message: "boom" }]
      }
    });

    const provider = createMemoryObservationProvider({
      client: { readMemory },
      roomName: "E1S1"
    });

    await expect(provider()).resolves.toEqual([
      {
        tick: 42,
        state: {
          threat: "LOW",
          posture: "ALERT",
          tower: { action: "hold" }
        },
        runtimeExceptions: ["boom"]
      }
    ]);
    expect(readMemory).toHaveBeenCalledWith();
  });
});
