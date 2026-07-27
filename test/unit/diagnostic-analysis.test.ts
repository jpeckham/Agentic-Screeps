import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  DIAGNOSTIC_ANALYSIS_PROMPT_VERSION,
  type DiagnosticAnalysisResponse
} from "../../src/diagnostics/analysis/analysis-contracts.js";
import {
  FakeDiagnosticAnalysisClient,
  OpenAiDiagnosticAnalysisClient
} from "../../src/diagnostics/analysis/diagnostic-analysis-client.js";
import {
  createDiagnosticAnalysisClientForMode,
  parseDiagnosticAnalysisCliOptions
} from "../../src/diagnostics/analysis/diagnostic-analysis-cli.js";
import {
  analyzeDiagnosticReport,
  readDiagnosticAnalysisConfig
} from "../../src/diagnostics/analysis/diagnostic-analysis-service.js";
import {
  buildDiagnosticAnalysisContext,
  selectCodeContext
} from "../../src/diagnostics/analysis/diagnostic-context-builder.js";
import { validateDiagnosticAnalysisResponse } from "../../src/diagnostics/analysis/evidence-claim-validator.js";
import { selectEvidenceForAnalysis } from "../../src/diagnostics/analysis/evidence-selector.js";
import { renderDiagnosticAnalysisMarkdown } from "../../src/diagnostics/analysis/analysis-report-renderer.js";
import { parseDiagnosticAnalysisResponse } from "../../src/diagnostics/analysis/structured-response-validator.js";

const delayedReportPath = "artifacts/diagnostics/observed-critical-hauler-loss-with-containers/diagnostic-report.json";
const controlReportPath = "artifacts/diagnostics/observed-critical-hauler-loss-control-with-containers/diagnostic-report.json";

describe("diagnostic analysis evidence selection", () => {
  test("generates stable evidence IDs and preserves finding observations", async () => {
    const report = await readReport(delayedReportPath);

    const selected = selectEvidenceForAnalysis(report, { maxTimelineEvents: 5, maxMetrics: 4 });

    expect(selected.findings[0]?.findingId).toBe("observed-critical-hauler-loss-with-containers:LOGISTICS_HAULING_CAPACITY_DEFICIT");
    expect(selected.evidence.map((item) => item.evidenceId)).toContain("FINDING-001");
    expect(selected.evidence.map((item) => item.evidenceId)).toContain("OBS-001");
    expect(selected.evidence.map((item) => item.evidenceId)).toContain("METRIC-001");
    expect(selected.evidence.find((item) => item.evidenceId === "OBS-001")).toMatchObject({
      evidenceType: "observation",
      firstTick: 14995,
      lastTick: 15072
    });
  });

  test("enforces context limits while summarizing omitted evidence", async () => {
    const report = await readReport(delayedReportPath);

    const selected = selectEvidenceForAnalysis(report, { maxFindings: 2, maxMetrics: 2, maxTimelineEvents: 0 });

    expect(selected.findings).toHaveLength(2);
    expect(selected.metrics).toHaveLength(2);
    expect(selected.timeline).toHaveLength(0);
    expect(selected.omittedEvidenceSummary).toContain("2 finding(s) omitted");
    expect(selected.omittedEvidenceSummary).toContain("11 metric(s) omitted");
  });

  test("preserves contradictory evidence even when metric limits are tight", async () => {
    const report = await readReport(controlReportPath);

    const selected = selectEvidenceForAnalysis(report, { maxMetrics: 1 });

    expect(selected.metrics.map((metric) => metric.metricName)).toContain("blockedMinerHarvestTicks");
    expect(selected.evidence.find((item) => item.description.includes("contradicts source backpressure"))).toMatchObject({
      evidenceType: "metric",
      value: 0
    });
  });
});

describe("diagnostic analysis context", () => {
  test("selects deterministic code context without file contents by default", async () => {
    const report = await readReport(delayedReportPath);

    const codeContext = selectCodeContext(report);

    expect(codeContext).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subsystem: "Hauler demand calculation",
          filePath: "src/workforce/workforce-planner.ts"
        }),
        expect.objectContaining({
          subsystem: "Diagnostic telemetry emission",
          filePath: "src/private-testing/bot-telemetry.ts"
        })
      ])
    );
    expect(JSON.stringify(codeContext)).not.toContain("process.env");
  });

  test("includes prompt version, scenario summary, bounded evidence, and omitted summary", async () => {
    const report = await readReport(delayedReportPath);

    const context = buildDiagnosticAnalysisContext(report, { maxFindings: 3, maxMetrics: 3 });

    expect(context.analysisVersion).toBe(DIAGNOSTIC_ANALYSIS_PROMPT_VERSION);
    expect(context.run).toMatchObject({
      runId: "observed-critical-hauler-loss-with-containers",
      scenarioId: "critical-hauler-loss",
      codeVersion: "38f4a87"
    });
    expect(context.instructions).toEqual({
      requireEvidenceReferences: true,
      distinguishFactsFromHypotheses: true,
      reportContradictions: true,
      reportEvidenceGaps: true
    });
    expect(context.omittedEvidenceSummary).toContain("finding(s) omitted");
  });
});

describe("diagnostic analysis response validation", () => {
  test("parses structured provider responses and rejects malformed output", () => {
    expect(parseDiagnosticAnalysisResponse(supportedDelayedResponse()).analysisVersion).toBe(DIAGNOSTIC_ANALYSIS_PROMPT_VERSION);
    expect(() => parseDiagnosticAnalysisResponse({ findingAssessments: [] })).toThrow(
      "Diagnostic analysis response missing overallAssessment."
    );
  });

  test("rejects unknown evidence and code-context references", async () => {
    const context = buildDiagnosticAnalysisContext(await readReport(delayedReportPath));
    const response = supportedDelayedResponse();
    response.findingAssessments[0]!.citedEvidenceIds.push("MISSING-999");
    response.recommendedInvestigations[0]!.relevantCodeContextIds.push("CODE-MISSING");

    const result = validateDiagnosticAnalysisResponse(response, context);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Unknown evidence ID referenced: MISSING-999");
    expect(result.errors).toContain("Unknown code context ID referenced: CODE-MISSING");
  });

  test("rejects unsupported factual conclusions and weak high-confidence hypotheses", async () => {
    const context = buildDiagnosticAnalysisContext(await readReport(delayedReportPath));
    const response = supportedDelayedResponse();
    response.findingAssessments[0]!.citedEvidenceIds = [];
    response.findingAssessments[0]!.causalHypotheses[0]!.supportingEvidenceIds = ["METRIC-001"];

    const result = validateDiagnosticAnalysisResponse(response, context);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Finding assessment observed-critical-hauler-loss-with-containers:LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT must cite evidence."
    );
    expect(result.errors).toContain("High-confidence hypothesis HYP-001 must cite at least two supporting evidence IDs or one direct causal observation.");
  });
});

describe("diagnostic analysis service", () => {
  test("supports deterministic fake analysis for delayed scenario and writes validated artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diagnostic-analysis-"));
    try {
      const result = await analyzeDiagnosticReport({
        reportPath: delayedReportPath,
        outputRoot: dir,
        client: new FakeDiagnosticAnalysisClient([supportedDelayedResponse()])
      });

      expect(result.status).toBe("success");
      expect(result.paths.contextJson).toContain("diagnostic-analysis-context.json");
      const analysis = JSON.parse(await readFile(requiredPath(result.paths.analysisJson), "utf8"));
      expect(analysis.promptVersion).toBe(DIAGNOSTIC_ANALYSIS_PROMPT_VERSION);
      expect(analysis.validatedAnalysis.findingAssessments[0].conclusion).toBe("supported");
      expect(await readFile(requiredPath(result.paths.analysisMarkdown), "utf8")).toContain("Evidence: FINDING-004, OBS-004, METRIC-004");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("does not invent delayed-replacement finding for control scenario", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diagnostic-analysis-control-"));
    try {
      const result = await analyzeDiagnosticReport({
        reportPath: controlReportPath,
        outputRoot: dir,
        client: new FakeDiagnosticAnalysisClient([supportedControlResponse()])
      });

      const analysis = JSON.parse(await readFile(requiredPath(result.paths.analysisJson), "utf8"));
      expect(analysis.validatedAnalysis.findingAssessments).toHaveLength(1);
      expect(JSON.stringify(analysis.validatedAnalysis)).not.toContain("LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT");
      expect(await readFile(requiredPath(result.paths.analysisMarkdown), "utf8")).toContain("timely recovery");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("retries once after invalid response and saves the valid retry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diagnostic-analysis-retry-"));
    try {
      const invalid = supportedDelayedResponse();
      invalid.findingAssessments[0]!.citedEvidenceIds = ["MISSING"];
      const client = new FakeDiagnosticAnalysisClient([invalid, supportedDelayedResponse()]);

      const result = await analyzeDiagnosticReport({
        reportPath: delayedReportPath,
        outputRoot: dir,
        client,
        validationRetryCount: 1
      });

      expect(result.status).toBe("success");
      expect(client.requests).toHaveLength(2);
      expect(JSON.parse(await readFile(requiredPath(result.paths.analysisJson), "utf8")).validationResults.retryCount).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("writes failed-analysis artifact and preserves previous valid analysis when retry remains invalid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diagnostic-analysis-failure-"));
    try {
      await analyzeDiagnosticReport({
        reportPath: delayedReportPath,
        outputRoot: dir,
        client: new FakeDiagnosticAnalysisClient([supportedDelayedResponse()])
      });
      const validBefore = await readFile(join(dir, "observed-critical-hauler-loss-with-containers", "analysis", "diagnostic-analysis.json"), "utf8");
      const invalid = supportedDelayedResponse();
      invalid.findingAssessments[0]!.citedEvidenceIds = ["MISSING"];

      const result = await analyzeDiagnosticReport({
        reportPath: delayedReportPath,
        outputRoot: dir,
        client: new FakeDiagnosticAnalysisClient([invalid, invalid]),
        validationRetryCount: 1
      });

      expect(result.status).toBe("failed");
      expect(result.paths.failedAnalysisJson).toBeDefined();
      expect(await readFile(join(dir, "observed-critical-hauler-loss-with-containers", "analysis", "diagnostic-analysis.json"), "utf8")).toBe(validBefore);
      expect(JSON.parse(await readFile(result.paths.failedAnalysisJson!, "utf8")).validationErrors).toContain("Unknown evidence ID referenced: MISSING");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns disabled result without invoking the client when analysis is disabled", async () => {
    const client = new FakeDiagnosticAnalysisClient([supportedDelayedResponse()]);

    const result = await analyzeDiagnosticReport({
      reportPath: delayedReportPath,
      client,
      enabled: false
    });

    expect(result.status).toBe("disabled");
    expect(client.requests).toHaveLength(0);
  });
});

describe("diagnostic analysis rendering and config", () => {
  test("renders evidence references for substantive markdown claims", async () => {
    const context = buildDiagnosticAnalysisContext(await readReport(delayedReportPath));

    const markdown = renderDiagnosticAnalysisMarkdown({
      context,
      response: supportedDelayedResponse(),
      validationErrors: []
    });

    expect(markdown).toContain("## LLM Assessment");
    expect(markdown).toContain("Evidence: FINDING-004, OBS-004, METRIC-004");
    expect(markdown).toContain("Evidence: METRIC-007");
  });

  test("reads provider configuration without exposing secrets", () => {
    const config = readDiagnosticAnalysisConfig({
      DIAGNOSTIC_ANALYSIS_ENABLED: "true",
      DIAGNOSTIC_ANALYSIS_PROVIDER: "openai",
      DIAGNOSTIC_ANALYSIS_MODEL: "gpt-test",
      DIAGNOSTIC_ANALYSIS_API_KEY: "secret-key",
      DIAGNOSTIC_ANALYSIS_TIMEOUT_MS: "1234"
    });

    expect(config).toMatchObject({
      enabled: true,
      provider: "openai",
      model: "gpt-test",
      timeoutMs: 1234
    });
    expect(JSON.stringify(config.redacted)).not.toContain("secret-key");
  });

  test("uses OPENAI_API_KEY when DIAGNOSTIC_ANALYSIS_API_KEY is not set", () => {
    const config = readDiagnosticAnalysisConfig({
      DIAGNOSTIC_ANALYSIS_ENABLED: "true",
      DIAGNOSTIC_ANALYSIS_PROVIDER: "openai",
      OPENAI_API_KEY: "openai-key"
    });

    expect(config.apiKey).toBe("openai-key");
    expect(JSON.stringify(config.redacted)).not.toContain("openai-key");
  });

  test("OpenAI client sends bounded structured request through injected transport", async () => {
    const context = buildDiagnosticAnalysisContext(await readReport(delayedReportPath));
    const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    const client = new OpenAiDiagnosticAnalysisClient({
      apiKey: "secret-key",
      model: "gpt-test",
      transport: async (request) => {
        calls.push(request);
        return { output_text: JSON.stringify(supportedDelayedResponse()) };
      }
    });

    const response = await client.analyze(context);

    expect(response.analysisVersion).toBe(DIAGNOSTIC_ANALYSIS_PROMPT_VERSION);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.headers.authorization).toBe("Bearer secret-key");
    expect(JSON.stringify(calls[0]?.body)).toContain("gpt-test");
  });

  test("OpenAI client extracts structured text from Responses API output content", async () => {
    const context = buildDiagnosticAnalysisContext(await readReport(delayedReportPath));
    const client = new OpenAiDiagnosticAnalysisClient({
      apiKey: "secret-key",
      model: "gpt-test",
      transport: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(supportedDelayedResponse())
              }
            ]
          }
        ]
      })
    });

    const response = await client.analyze(context);

    expect(response.findingAssessments[0]?.conclusion).toBe("supported");
  });

  test("selects fake mode only for explicit fake requests", () => {
    const options = parseDiagnosticAnalysisCliOptions(["report.json", "--fake"], {});

    expect(options).toMatchObject({
      reportPath: "report.json",
      mode: "fake"
    });
  });

  test("selects real-provider smoke mode ahead of configured fake defaults", () => {
    const options = parseDiagnosticAnalysisCliOptions(["report.json", "--real-provider-smoke"], {
      DIAGNOSTIC_ANALYSIS_PROVIDER: "fake",
      DIAGNOSTIC_ANALYSIS_ENABLED: "true"
    });

    expect(options.mode).toBe("real-provider-smoke");
    expect(options.config.provider).toBe("openai");
  });

  test("rejects contradictory fake and real-provider flags", () => {
    expect(() => parseDiagnosticAnalysisCliOptions(["report.json", "--fake", "--real-provider-smoke"], {})).toThrow(
      "Use either --fake or --real-provider-smoke, not both."
    );
  });

  test("real-provider smoke constructs OpenAI client and never fake client", () => {
    const constructed: string[] = [];
    const client = createDiagnosticAnalysisClientForMode({
      mode: "real-provider-smoke",
      config: readDiagnosticAnalysisConfig({
        DIAGNOSTIC_ANALYSIS_ENABLED: "true",
        DIAGNOSTIC_ANALYSIS_PROVIDER: "openai",
        DIAGNOSTIC_ANALYSIS_MODEL: "gpt-test",
        DIAGNOSTIC_ANALYSIS_API_KEY: "secret-key"
      }),
      factories: {
        fake: () => {
          constructed.push("fake");
          return new FakeDiagnosticAnalysisClient();
        },
        openai: () => {
          constructed.push("openai");
          return new FakeDiagnosticAnalysisClient([supportedDelayedResponse()]);
        }
      }
    });

    expect(client).toBeInstanceOf(FakeDiagnosticAnalysisClient);
    expect(constructed).toEqual(["openai"]);
  });

  test("missing real-provider API key reports provider configuration error", () => {
    expect(() => createDiagnosticAnalysisClientForMode({
      mode: "real-provider-smoke",
      config: readDiagnosticAnalysisConfig({
        DIAGNOSTIC_ANALYSIS_ENABLED: "true",
        DIAGNOSTIC_ANALYSIS_PROVIDER: "openai",
        DIAGNOSTIC_ANALYSIS_MODEL: "gpt-test"
      })
    })).toThrow("Real-provider analysis was requested, but DIAGNOSTIC_ANALYSIS_API_KEY is not configured.");
  });

  test("unknown configured provider reports a clear error", () => {
    expect(() => parseDiagnosticAnalysisCliOptions(["report.json"], {
      DIAGNOSTIC_ANALYSIS_ENABLED: "true",
      DIAGNOSTIC_ANALYSIS_PROVIDER: "anthropic"
    })).toThrow("Unsupported diagnostic analysis provider: anthropic");
  });

  test("real-smoke npm script passes the explicit real-provider flag", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };

    expect(packageJson.scripts["diagnostics:analyze:real-smoke"]).toContain("--real-provider-smoke");
  });

  test("analysis wrapper rebuilds the temporary bundle before import", async () => {
    const wrapper = await readFile("scripts/analyze-diagnostic-report.mjs", "utf8");

    expect(wrapper.indexOf("await build({")).toBeGreaterThan(-1);
    expect(wrapper.indexOf("await import(pathToFileURL(outfile).href)")).toBeGreaterThan(wrapper.indexOf("await build({"));
  });

  test("versioned prompt lists the required structured response fields", async () => {
    const prompt = await readFile("src/diagnostics/analysis/prompts/diagnostic-analyst-v1.md", "utf8");

    expect(prompt).toContain("findingAssessments");
    expect(prompt).toContain("overallAssessment");
    expect(prompt).toContain("recommendedInvestigations");
    expect(prompt).toContain("reproductionAssessment");
    expect(prompt).toContain("unsupportedClaims");
  });
});

async function readReport(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

function requiredPath(path: string | undefined): string {
  if (!path) throw new Error("Expected analysis path to be defined.");
  return path;
}

function supportedDelayedResponse(): DiagnosticAnalysisResponse {
  return {
    analysisVersion: DIAGNOSTIC_ANALYSIS_PROMPT_VERSION,
    findingAssessments: [
      {
        findingId: "observed-critical-hauler-loss-with-containers:LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT",
        conclusion: "supported",
        explanation: "The capacity deficit and delayed replacement overlap source backpressure, so the deterministic correlated finding is supported by supplied evidence.",
        citedEvidenceIds: ["FINDING-004", "OBS-004", "METRIC-004"],
        causalHypotheses: [
          {
            hypothesisId: "HYP-001",
            description: "Replacement delay kept hauling capacity low long enough for source containers to fill.",
            confidence: "high",
            supportingEvidenceIds: ["OBS-004", "METRIC-004"],
            contradictingEvidenceIds: [],
            relevantCodeContextIds: ["CODE-004"],
            verificationSteps: ["Compare replacement request and spawn ticks against capacity and fullness evidence."]
          }
        ],
        alternativeExplanations: [
          {
            description: "Spawn priority could contribute only if queued-ahead evidence exists.",
            supportingEvidenceIds: [],
            evidenceNeeded: ["Spawn queue ordering telemetry for the replacement request."]
          }
        ]
      }
    ],
    overallAssessment: {
      summary: "The delayed run supports delayed replacement as the bounded root-cause explanation.",
      citedEvidenceIds: ["FINDING-004", "METRIC-004"]
    },
    recommendedInvestigations: [
      {
        priority: 1,
        title: "Trace replacement request timing",
        rationale: "This is the smallest check that separates demand calculation from request creation delay.",
        relatedFindingIds: ["observed-critical-hauler-loss-with-containers:LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT"],
        relatedEvidenceIds: ["OBS-004", "METRIC-004"],
        relevantCodeContextIds: ["CODE-004"],
        steps: ["Log hauler death tick, replacement request tick, and spawn start tick in one timeline."],
        expectedObservation: "Request delay remains above tolerance when the issue reproduces.",
        stopCondition: "Stop when request delay is within tolerance or the delay source is identified."
      }
    ],
    reproductionAssessment: {
      summary: "The delayed scenario is a useful reproduction and should add queue-ordering telemetry before blaming spawn priority.",
      citedEvidenceIds: ["FINDING-004", "METRIC-004"]
    },
    evidenceGaps: [
      {
        description: "Need telemetry for spawn queue ordering, body adequacy, pathing, and congestion.",
        whyItMatters: "These distinguish bad demand calculation, delayed request creation, bad priority, slow spawning, weak body, and movement issues.",
        suggestedTelemetry: ["spawn.queuePosition", "replacement.bodyCapacity", "hauler.pathBlockedTicks"]
      }
    ],
    unsupportedClaims: [
      {
        claim: "Spawn prioritization caused the delay.",
        reasonUnsupported: "No supplied evidence says another request was placed ahead of the replacement."
      }
    ]
  };
}

function supportedControlResponse(): DiagnosticAnalysisResponse {
  return {
    analysisVersion: DIAGNOSTIC_ANALYSIS_PROMPT_VERSION,
    findingAssessments: [
      {
        findingId: "observed-critical-hauler-loss-control-with-containers:LOGISTICS_HAULING_CAPACITY_DEFICIT",
        conclusion: "supported",
        explanation: "The control report supports a temporary hauling deficit and timely recovery, not delayed replacement backpressure.",
        citedEvidenceIds: ["FINDING-001", "OBS-001", "METRIC-003"],
        causalHypotheses: [
          {
            hypothesisId: "HYP-CONTROL-001",
            description: "The temporary deficit recovered before source backpressure developed.",
            confidence: "medium",
            supportingEvidenceIds: ["OBS-001", "METRIC-003"],
            contradictingEvidenceIds: ["METRIC-007"],
            relevantCodeContextIds: ["CODE-004"],
            verificationSteps: ["Compare replacement gap and maximum fullness in the control report."]
          }
        ],
        alternativeExplanations: []
      }
    ],
    overallAssessment: {
      summary: "The control case demonstrates successful or timely recovery when judged against supplied evidence.",
      citedEvidenceIds: ["FINDING-001", "METRIC-003", "METRIC-007"]
    },
    recommendedInvestigations: [
      {
        priority: 1,
        title: "Keep control telemetry for regression comparison",
        rationale: "It distinguishes residual deficit from the absent delayed-replacement root cause.",
        relatedFindingIds: ["observed-critical-hauler-loss-control-with-containers:LOGISTICS_HAULING_CAPACITY_DEFICIT"],
        relatedEvidenceIds: ["FINDING-001", "METRIC-003"],
        relevantCodeContextIds: ["CODE-004"],
        steps: ["Compare total replacement gap between control and delayed runs."],
        expectedObservation: "Control replacement gap stays below the delayed scenario gap.",
        stopCondition: "Stop when control remains under configured tolerances."
      }
    ],
    reproductionAssessment: {
      summary: "The control scenario is suitable as a regression guard for timely recovery.",
      citedEvidenceIds: ["METRIC-003", "METRIC-007"]
    },
    evidenceGaps: [],
    unsupportedClaims: []
  };
}
