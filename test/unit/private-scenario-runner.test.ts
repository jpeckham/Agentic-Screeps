import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runPrivateScenario } from "../../src/private-testing/scenario-runner.js";

describe("private scenario runner", () => {
  test("writes a failing report and returns nonzero when the private server is stopped", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "private-runner-"));
    try {
      const result = await runPrivateScenario({
        scenarioName: "melee-attacker",
        definitionsDir: "test/scenarios/definitions",
        outputDir,
        statusProvider: async () => ({
          running: false,
          endpoint: "http://127.0.0.1:21025",
          error: "unreachable: fetch failed"
        })
      });

      expect(result.exitCode).toBe(1);
      expect(result.report.passed).toBe(false);
      expect(await readFile(result.report.textPath, "utf8")).toContain("FAIL melee-attacker");
      expect(await readFile(result.report.textPath, "utf8")).toContain("private server is not running");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  test("evaluates supplied observations for a ready server without fabricating state", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "private-runner-"));
    try {
      const result = await runPrivateScenario({
        scenarioName: "no-hostile-baseline",
        definitionsDir: "test/scenarios/definitions",
        outputDir,
        statusProvider: async () => ({
          running: true,
          endpoint: "http://127.0.0.1:21025",
          tick: 100
        }),
        observationProvider: async () => [
          {
            tick: 100,
            state: {
              threat: "NONE",
              posture: "PEACE",
              tower: { action: "hold" }
            },
            runtimeExceptions: []
          }
        ]
      });

      expect(result.exitCode).toBe(0);
      expect(result.report.passed).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  test("orchestrates reset, baseline seed, deployment, and hostile seed before collecting observations", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "private-runner-"));
    try {
      const steps: string[] = [];
      const result = await runPrivateScenario({
        scenarioName: "melee-attacker",
        definitionsDir: "test/scenarios/definitions",
        outputDir,
        statusProvider: async () => ({
          running: true,
          endpoint: "http://127.0.0.1:21025",
          tick: 200
        }),
        lifecycle: {
          resetWorld: async () => {
            steps.push("reset");
          },
          deployBot: async () => {
            steps.push("deploy");
          },
          seedBaseline: async () => {
            steps.push("seed-baseline");
          },
          seedHostiles: async (scenario) => {
            steps.push(`seed-hostiles:${scenario.name}`);
          }
        },
        observationProvider: async () => {
          steps.push("collect");
          return [
            {
              tick: 200,
              state: {
                threat: "MEDIUM",
                posture: "ENGAGE",
                tower: { action: "attack" },
                hostiles: { "attacker-1": { hits: 200 } }
              },
              runtimeExceptions: []
            },
            {
              tick: 201,
              state: {
                threat: "MEDIUM",
                posture: "ENGAGE",
                tower: { action: "attack" },
                hostiles: { "attacker-1": { hits: 50 } }
              },
              runtimeExceptions: []
            }
          ];
        }
      });

      expect(steps).toEqual(["reset", "seed-baseline", "deploy", "seed-hostiles:melee-attacker", "collect"]);
      expect(result.exitCode).toBe(0);
      expect(result.report.passed).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
