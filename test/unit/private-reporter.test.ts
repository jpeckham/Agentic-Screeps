import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { writeScenarioReport } from "../../src/private-testing/reporter.js";

describe("private scenario reporter", () => {
  test("writes human-readable and JSON reports with nonzero failure count", async () => {
    const dir = await mkdtemp(join(tmpdir(), "private-report-"));
    try {
      const report = await writeScenarioReport({
        scenarioName: "melee-attacker",
        startedAtTick: 100,
        endedAtTick: 104,
        results: [
          { status: "pass", label: "posture became ENGAGE", observedTick: 101 },
          {
            status: "fail",
            label: "tower attacked hostile",
            message: "expected attack, actual idle",
            expected: "attack",
            actual: "idle",
            observedTick: 104
          }
        ],
        outputDir: dir
      });

      expect(report.passed).toBe(false);
      expect(report.failureCount).toBe(1);
      expect(await readFile(report.textPath, "utf8")).toContain("FAIL melee-attacker");
      expect(await readFile(report.textPath, "utf8")).toContain("FAIL tower attacked hostile");

      const json = JSON.parse(await readFile(report.jsonPath, "utf8"));
      expect(json).toMatchObject({
        scenarioName: "melee-attacker",
        passed: false,
        failureCount: 1,
        startedAtTick: 100,
        endedAtTick: 104
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
