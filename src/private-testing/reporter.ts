import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AssertionResult } from "./assertions.js";

export interface ScenarioReportInput {
  scenarioName: string;
  startedAtTick: number;
  endedAtTick: number;
  results: AssertionResult[];
  outputDir: string;
}

export interface ScenarioReportResult {
  scenarioName: string;
  passed: boolean;
  failureCount: number;
  textPath: string;
  jsonPath: string;
}

export async function writeScenarioReport(input: ScenarioReportInput): Promise<ScenarioReportResult> {
  const failureCount = input.results.filter((result) => result.status === "fail").length;
  const passed = failureCount === 0;
  await mkdir(input.outputDir, { recursive: true });

  const safeName = input.scenarioName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const textPath = join(input.outputDir, `${safeName}.txt`);
  const jsonPath = join(input.outputDir, `${safeName}.json`);

  await writeFile(textPath, formatTextReport(input, passed), "utf8");
  await writeFile(
    jsonPath,
    `${JSON.stringify({ ...input, passed, failureCount }, null, 2)}\n`,
    "utf8"
  );

  return {
    scenarioName: input.scenarioName,
    passed,
    failureCount,
    textPath,
    jsonPath
  };
}

function formatTextReport(input: ScenarioReportInput, passed: boolean): string {
  const lines = [
    `${passed ? "PASS" : "FAIL"} ${input.scenarioName}`,
    `  ticks ${input.startedAtTick}..${input.endedAtTick}`
  ];

  for (const result of input.results) {
    lines.push(`  ${result.status.toUpperCase()} ${result.label}`);
    if (result.status === "fail" && result.message) {
      lines.push(`       ${result.message}`);
    }
    if (result.status === "fail" && result.observedTick !== undefined) {
      lines.push(`       observed at tick ${result.observedTick}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
