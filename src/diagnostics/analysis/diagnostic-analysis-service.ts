import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  DIAGNOSTIC_ANALYSIS_PROMPT_VERSION,
  type AnalysisContextLimits,
  type DiagnosticAnalysisClient,
  type DiagnosticAnalysisResponse
} from "./analysis-contracts.js";
import { renderDiagnosticAnalysisMarkdown } from "./analysis-report-renderer.js";
import { OpenAiDiagnosticAnalysisClient } from "./diagnostic-analysis-client.js";
import { buildDiagnosticAnalysisContext } from "./diagnostic-context-builder.js";
import { validateDiagnosticAnalysisResponse } from "./evidence-claim-validator.js";
import type { DiagnosticReport } from "./report-types.js";

export interface DiagnosticAnalysisConfig {
  enabled: boolean;
  provider: "fake" | "openai" | "disabled";
  model: string;
  apiKey?: string | undefined;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  retryCount: number;
  redacted: Record<string, string | number | boolean | undefined>;
}

export interface AnalyzeDiagnosticReportOptions {
  reportPath: string;
  outputRoot?: string;
  enabled?: boolean;
  client?: DiagnosticAnalysisClient;
  contextLimits?: AnalysisContextLimits;
  validationRetryCount?: number;
  config?: DiagnosticAnalysisConfig;
}

export interface AnalyzeDiagnosticReportResult {
  status: "success" | "failed" | "disabled";
  paths: {
    contextJson?: string;
    rawResponseJson?: string;
    analysisJson?: string;
    analysisMarkdown?: string;
    invalidResponseJson?: string;
    failedAnalysisJson?: string;
  };
  validationErrors: string[];
}

export async function analyzeDiagnosticReport(
  options: AnalyzeDiagnosticReportOptions
): Promise<AnalyzeDiagnosticReportResult> {
  const config = options.config ?? readDiagnosticAnalysisConfig(process.env);
  const enabled = options.enabled ?? (options.client ? true : config.enabled);
  if (!enabled) return { status: "disabled", paths: {}, validationErrors: [] };

  const report = JSON.parse(await readFile(options.reportPath, "utf8")) as DiagnosticReport;
  validateReport(report);
  const context = buildDiagnosticAnalysisContext(report, options.contextLimits);
  const outputDir = join(options.outputRoot ?? "artifacts/diagnostics", context.run.runId, "analysis");
  await mkdir(outputDir, { recursive: true });
  const contextJson = join(outputDir, "diagnostic-analysis-context.json");
  const rawResponseJson = join(outputDir, "diagnostic-analysis-response.json");
  const analysisJson = join(outputDir, "diagnostic-analysis.json");
  const analysisMarkdown = join(outputDir, "diagnostic-analysis.md");
  await writeFile(contextJson, `${JSON.stringify(context, null, 2)}\n`, "utf8");

  const client = options.client ?? createConfiguredClient(config);
  const retryLimit = options.validationRetryCount ?? config.retryCount;
  let validationErrors: string[] = [];
  let response: DiagnosticAnalysisResponse | undefined;
  const started = performance.now();
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    response = await client.analyze({ ...context, validationFeedback: validationErrors.length ? validationErrors : undefined });
    const validation = validateDiagnosticAnalysisResponse(response, context);
    validationErrors = validation.errors;
    if (validation.valid) {
      const durationMs = Math.round(performance.now() - started);
      await writeFile(rawResponseJson, `${JSON.stringify(response, null, 2)}\n`, "utf8");
      await writeFile(analysisJson, `${JSON.stringify({
        run: context.run,
        deterministicReportPath: options.reportPath,
        promptVersion: DIAGNOSTIC_ANALYSIS_PROMPT_VERSION,
        provider: { name: config.provider, model: config.model },
        contextLimits: context.contextLimits,
        omittedEvidenceSummary: context.omittedEvidenceSummary,
        validatedAnalysis: response,
        validationResults: { valid: true, errors: [], retryCount: attempt },
        invocationDurationMs: durationMs,
        tokenUsage: undefined
      }, null, 2)}\n`, "utf8");
      await writeFile(analysisMarkdown, renderDiagnosticAnalysisMarkdown({ context, response, validationErrors: [] }), "utf8");
      return {
        status: "success",
        paths: { contextJson, rawResponseJson, analysisJson, analysisMarkdown },
        validationErrors: []
      };
    }
  }

  const invalidResponseJson = join(outputDir, "diagnostic-analysis-invalid-response.json");
  const failedAnalysisJson = join(outputDir, `failed-analysis-${Date.now()}.json`);
  if (response) await writeFile(invalidResponseJson, `${JSON.stringify(response, null, 2)}\n`, "utf8");
  await writeFile(failedAnalysisJson, `${JSON.stringify({
    run: context.run,
    deterministicReportPath: options.reportPath,
    promptVersion: DIAGNOSTIC_ANALYSIS_PROMPT_VERSION,
    validationErrors,
    invalidResponsePath: invalidResponseJson
  }, null, 2)}\n`, "utf8");
  return {
    status: "failed",
    paths: { contextJson, invalidResponseJson, failedAnalysisJson },
    validationErrors
  };
}

export function readDiagnosticAnalysisConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): DiagnosticAnalysisConfig {
  const provider = env.DIAGNOSTIC_ANALYSIS_PROVIDER === "openai" ? "openai" : env.DIAGNOSTIC_ANALYSIS_PROVIDER === "fake" ? "fake" : "disabled";
  const enabled = parseBoolean(env.DIAGNOSTIC_ANALYSIS_ENABLED) && provider !== "disabled";
  const model = env.DIAGNOSTIC_ANALYSIS_MODEL ?? (provider === "openai" ? "gpt-4.1-mini" : "fake-diagnostic-analyst");
  return {
    enabled,
    provider,
    model,
    apiKey: env.DIAGNOSTIC_ANALYSIS_API_KEY || env.OPENAI_API_KEY,
    maxInputTokens: parseNumber(env.DIAGNOSTIC_ANALYSIS_MAX_INPUT_TOKENS, 24_000),
    maxOutputTokens: parseNumber(env.DIAGNOSTIC_ANALYSIS_MAX_OUTPUT_TOKENS, 4_000),
    timeoutMs: parseNumber(env.DIAGNOSTIC_ANALYSIS_TIMEOUT_MS, 60_000),
    retryCount: parseNumber(env.DIAGNOSTIC_ANALYSIS_RETRY_COUNT, 1),
    redacted: {
      DIAGNOSTIC_ANALYSIS_ENABLED: enabled,
      DIAGNOSTIC_ANALYSIS_PROVIDER: provider,
      DIAGNOSTIC_ANALYSIS_MODEL: model,
      DIAGNOSTIC_ANALYSIS_API_KEY: env.DIAGNOSTIC_ANALYSIS_API_KEY || env.OPENAI_API_KEY ? "[redacted]" : undefined,
      DIAGNOSTIC_ANALYSIS_MAX_INPUT_TOKENS: parseNumber(env.DIAGNOSTIC_ANALYSIS_MAX_INPUT_TOKENS, 24_000),
      DIAGNOSTIC_ANALYSIS_MAX_OUTPUT_TOKENS: parseNumber(env.DIAGNOSTIC_ANALYSIS_MAX_OUTPUT_TOKENS, 4_000),
      DIAGNOSTIC_ANALYSIS_TIMEOUT_MS: parseNumber(env.DIAGNOSTIC_ANALYSIS_TIMEOUT_MS, 60_000),
      DIAGNOSTIC_ANALYSIS_RETRY_COUNT: parseNumber(env.DIAGNOSTIC_ANALYSIS_RETRY_COUNT, 1)
    }
  };
}

function createConfiguredClient(config: DiagnosticAnalysisConfig): DiagnosticAnalysisClient {
  if (config.provider !== "openai") {
    throw new Error("No default fake response is configured. Pass FakeDiagnosticAnalysisClient explicitly for deterministic analysis.");
  }
  if (!config.apiKey) throw new Error("DIAGNOSTIC_ANALYSIS_API_KEY is required for OpenAI diagnostic analysis.");
  return new OpenAiDiagnosticAnalysisClient({
    apiKey: config.apiKey,
    model: config.model,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs
  });
}

function validateReport(report: DiagnosticReport): void {
  if (!report.metadata?.runId) throw new Error("Diagnostic report metadata.runId is required.");
  if (!Array.isArray(report.findings)) throw new Error("Diagnostic report findings array is required.");
}

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}
