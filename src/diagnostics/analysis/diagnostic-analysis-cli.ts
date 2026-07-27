import {
  FakeDiagnosticAnalysisClient,
  OpenAiDiagnosticAnalysisClient,
  type OpenAiDiagnosticAnalysisClientOptions
} from "./diagnostic-analysis-client.js";
import {
  analyzeDiagnosticReport,
  readDiagnosticAnalysisConfig,
  type DiagnosticAnalysisConfig
} from "./diagnostic-analysis-service.js";
import type { DiagnosticAnalysisClient } from "./analysis-contracts.js";

export type DiagnosticAnalysisMode = "fake" | "configured" | "real-provider-smoke";

export interface DiagnosticAnalysisCliOptions {
  reportPath: string;
  mode: DiagnosticAnalysisMode;
  config: DiagnosticAnalysisConfig;
}

export interface DiagnosticAnalysisClientFactories {
  fake?: () => DiagnosticAnalysisClient;
  openai?: (options: OpenAiDiagnosticAnalysisClientOptions) => DiagnosticAnalysisClient;
}

export interface DiagnosticAnalysisClientForModeOptions {
  mode: DiagnosticAnalysisMode;
  config: DiagnosticAnalysisConfig;
  injectedClient?: DiagnosticAnalysisClient;
  factories?: DiagnosticAnalysisClientFactories;
}

export function parseDiagnosticAnalysisCliOptions(
  args: string[],
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): DiagnosticAnalysisCliOptions {
  const reportPath = args.find((arg) => !arg.startsWith("--"));
  if (!reportPath) {
    throw new Error("Usage: npm run diagnostics:analyze -- <path-to-diagnostic-report.json> [--fake] [--real-provider-smoke]");
  }
  const explicitFake = args.includes("--fake");
  const explicitReal = args.includes("--real-provider-smoke");
  if (explicitFake && explicitReal) {
    throw new Error("Use either --fake or --real-provider-smoke, not both.");
  }
  if (explicitReal) {
    return {
      reportPath,
      mode: "real-provider-smoke",
      config: readDiagnosticAnalysisConfig({
        ...env,
        DIAGNOSTIC_ANALYSIS_ENABLED: "true",
        DIAGNOSTIC_ANALYSIS_PROVIDER: "openai"
      })
    };
  }
  if (explicitFake) {
    return {
      reportPath,
      mode: "fake",
      config: readDiagnosticAnalysisConfig({
        ...env,
        DIAGNOSTIC_ANALYSIS_ENABLED: "true",
        DIAGNOSTIC_ANALYSIS_PROVIDER: "fake"
      })
    };
  }
  const provider = env.DIAGNOSTIC_ANALYSIS_PROVIDER;
  if (provider && !["disabled", "fake", "openai"].includes(provider)) {
    throw new Error(`Unsupported diagnostic analysis provider: ${provider}`);
  }
  return {
    reportPath,
    mode: "configured",
    config: readDiagnosticAnalysisConfig(env)
  };
}

export function createDiagnosticAnalysisClientForMode(
  options: DiagnosticAnalysisClientForModeOptions
): DiagnosticAnalysisClient | undefined {
  const fakeFactory = options.factories?.fake ?? (() => new FakeDiagnosticAnalysisClient());
  const openAiFactory = options.factories?.openai ?? ((clientOptions) => new OpenAiDiagnosticAnalysisClient(clientOptions));
  if (options.mode === "real-provider-smoke") {
    validateOpenAiConfig(options.config, "Real-provider analysis was requested");
    return openAiFactory(openAiOptions(options.config));
  }
  if (options.mode === "fake") return fakeFactory();
  if (options.injectedClient) return options.injectedClient;
  if (!options.config.enabled) return undefined;
  if (options.config.provider === "fake") return fakeFactory();
  if (options.config.provider === "openai") {
    validateOpenAiConfig(options.config, "OpenAI diagnostic analysis was configured");
    return openAiFactory(openAiOptions(options.config));
  }
  return undefined;
}

export async function runDiagnosticAnalysisCli(args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  try {
    const parsed = parseDiagnosticAnalysisCliOptions(args, env);
    const client = createDiagnosticAnalysisClientForMode({
      mode: parsed.mode,
      config: parsed.config
    });
    printProviderMode(parsed);
    const analyzeOptions = {
      reportPath: parsed.reportPath,
      enabled: parsed.mode === "real-provider-smoke" || parsed.mode === "fake" || parsed.config.enabled,
      config: parsed.config
    };
    const result = await analyzeDiagnosticReport(client ? { ...analyzeOptions, client } : analyzeOptions);
    console.log(`Diagnostic analysis status: ${result.status}`);
    for (const [label, path] of Object.entries(result.paths)) {
      if (path) console.log(`${label}: ${path}`);
    }
    if (result.validationErrors.length > 0) {
      console.error(result.validationErrors.join("\n"));
      return 1;
    }
    return result.status === "failed" ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function printProviderMode(options: DiagnosticAnalysisCliOptions): void {
  if (options.mode === "real-provider-smoke") {
    console.log("Diagnostic analysis provider: OpenAI");
    console.log(`Model: ${options.config.model}`);
    console.log("Mode: real-provider smoke test");
    return;
  }
  if (options.mode === "fake") {
    console.log("Diagnostic analysis provider: fake");
    console.log(`Model: ${options.config.model}`);
    console.log("Mode: deterministic fake analysis");
    return;
  }
  console.log(`Diagnostic analysis provider: ${options.config.provider}`);
  console.log(`Model: ${options.config.model}`);
  console.log("Mode: configured");
}

function validateOpenAiConfig(config: DiagnosticAnalysisConfig, prefix: string): void {
  if (!config.model.trim()) {
    throw new Error(`${prefix}, but DIAGNOSTIC_ANALYSIS_MODEL is not configured.`);
  }
  if (!config.apiKey?.trim()) {
    throw new Error(`${prefix}, but DIAGNOSTIC_ANALYSIS_API_KEY is not configured.`);
  }
}

function openAiOptions(config: DiagnosticAnalysisConfig): OpenAiDiagnosticAnalysisClientOptions {
  validateOpenAiConfig(config, "OpenAI diagnostic analysis was configured");
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error("OpenAI diagnostic analysis was configured, but DIAGNOSTIC_ANALYSIS_API_KEY is not configured.");
  return {
    apiKey,
    model: config.model,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs
  };
}
