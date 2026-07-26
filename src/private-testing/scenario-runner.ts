import type { ScenarioObservation } from "./assertions.js";
import { evaluateAssertions } from "./assertions.js";
import { writeScenarioReport, type ScenarioReportResult } from "./reporter.js";
import { loadScenarioDefinitions, type CombatScenario } from "./scenarios.js";

export interface PrivateServerStatus {
  running: boolean;
  endpoint: string;
  error?: string;
  tick?: number;
}

export interface RunPrivateScenarioOptions {
  scenarioName: string;
  definitionsDir: string;
  outputDir: string;
  statusProvider: () => Promise<PrivateServerStatus>;
  lifecycle?: PrivateScenarioLifecycle;
  observationProvider?: () => Promise<ScenarioObservation[]>;
}

export interface PrivateScenarioLifecycle {
  resetWorld?: () => Promise<void>;
  seedBaseline?: () => Promise<void>;
  deployBot?: () => Promise<void>;
  seedHostiles?: (scenario: CombatScenario) => Promise<void>;
}

export interface RunPrivateScenarioResult {
  exitCode: number;
  report: ScenarioReportResult;
}

export async function runPrivateScenario(
  options: RunPrivateScenarioOptions
): Promise<RunPrivateScenarioResult> {
  const scenarios = await loadScenarioDefinitions(options.definitionsDir);
  const scenario = scenarios.find((candidate) => candidate.name === options.scenarioName);
  if (!scenario) throw new Error(`Unknown private scenario "${options.scenarioName}".`);

  const status = await options.statusProvider();
  if (!status.running) {
    const report = await writeScenarioReport({
      scenarioName: scenario.name,
      startedAtTick: status.tick ?? 0,
      endedAtTick: status.tick ?? 0,
      outputDir: options.outputDir,
      results: [
        {
          status: "fail",
          label: "private server is not running",
          message: status.error ?? `private server is unavailable at ${status.endpoint}`
        }
      ]
    });
    return { exitCode: 1, report };
  }

  if (!options.observationProvider) {
    const report = await writeScenarioReport({
      scenarioName: scenario.name,
      startedAtTick: status.tick ?? 0,
      endedAtTick: status.tick ?? 0,
      outputDir: options.outputDir,
      results: [
        {
          status: "fail",
          label: "state collection is not implemented",
          message: "real private-server observation provider is pending"
        }
      ]
    });
    return { exitCode: 1, report };
  }

  await options.lifecycle?.resetWorld?.();
  await options.lifecycle?.seedBaseline?.();
  await options.lifecycle?.deployBot?.();
  if (scenario.hostileCreeps.length > 0) {
    await options.lifecycle?.seedHostiles?.(scenario);
  }

  const observations = await options.observationProvider();
  const results = evaluateAssertions(scenario.assertions, observations);
  const report = await writeScenarioReport({
    scenarioName: scenario.name,
    startedAtTick: observations[0]?.tick ?? status.tick ?? 0,
    endedAtTick: observations.at(-1)?.tick ?? status.tick ?? 0,
    outputDir: options.outputDir,
    results
  });

  return {
    exitCode: report.passed ? 0 : 1,
    report
  };
}
