import {
  DEFAULT_ANALYSIS_CONTEXT_LIMITS,
  DIAGNOSTIC_ANALYSIS_PROMPT_VERSION,
  type AnalysisCodeContext,
  type AnalysisContextLimits,
  type DiagnosticAnalysisRequest
} from "./analysis-contracts.js";
import { selectEvidenceForAnalysis } from "./evidence-selector.js";
import type { DiagnosticReport } from "./report-types.js";

export function buildDiagnosticAnalysisContext(
  report: DiagnosticReport,
  limits: AnalysisContextLimits = {}
): DiagnosticAnalysisRequest {
  const selected = selectEvidenceForAnalysis(report, limits);
  const codeContext = selectCodeContext(report).slice(0, selected.limits.maxCodeContextEntries);
  const request: DiagnosticAnalysisRequest = {
    analysisVersion: DIAGNOSTIC_ANALYSIS_PROMPT_VERSION,
    run: {
      runId: report.metadata?.runId ?? "unknown-run",
      scenarioId: report.metadata?.scenarioId ?? report.scenario?.name ?? "unknown-scenario",
      codeVersion: report.metadata?.codeVersion
    },
    scenarioSummary: {
      objective: report.scenario?.description,
      injectedFaults: injectedFaults(report),
      successCriteria: report.scenario?.assertions?.map((assertion) => assertion.label ?? assertion.type ?? "unnamed assertion")
    },
    deterministicFindings: selected.findings,
    selectedMetrics: selected.metrics,
    timeline: selected.timeline,
    relevantConfiguration: report.configuration ?? {},
    codeContext,
    instructions: {
      requireEvidenceReferences: true,
      distinguishFactsFromHypotheses: true,
      reportContradictions: true,
      reportEvidenceGaps: true
    },
    evidence: [
      ...selected.evidence,
      ...codeContext.map((context): typeof selected.evidence[number] => ({
        evidenceId: context.contextId,
        evidenceType: "code",
        description: `${context.subsystem}: ${context.reasonRelevant}`,
        sourcePath: context.filePath
      }))
    ],
    omittedEvidenceSummary: selected.omittedEvidenceSummary,
    contextLimits: { ...DEFAULT_ANALYSIS_CONTEXT_LIMITS, ...limits }
  };
  return enforceSerializedLimit(request);
}

export function selectCodeContext(report: DiagnosticReport): AnalysisCodeContext[] {
  void report;
  return [
    {
      contextId: "CODE-001",
      subsystem: "Hauler demand calculation",
      symbol: "planWorkforce",
      filePath: "src/workforce/workforce-planner.ts",
      reasonRelevant: "Calculates required hauling capacity and creep demand."
    },
    {
      contextId: "CODE-002",
      subsystem: "Spawn request creation",
      symbol: "runSurvivalLoop",
      filePath: "src/survival/survival-loop.ts",
      reasonRelevant: "Creates replacement creep requests used by the colony loop."
    },
    {
      contextId: "CODE-003",
      subsystem: "Spawn request prioritization",
      symbol: "runColony",
      filePath: "src/colony/colony-controller.ts",
      reasonRelevant: "Coordinates spawn planning and role priority decisions."
    },
    {
      contextId: "CODE-004",
      subsystem: "Creep replacement policy",
      symbol: "createCriticalHaulerLossScenario",
      filePath: "src/private-testing/critical-hauler-loss-scenario.ts",
      reasonRelevant: "Defines controlled hauler loss and replacement timing for the diagnostic scenario."
    },
    {
      contextId: "CODE-005",
      subsystem: "Source-container monitoring",
      symbol: "calculateDiagnosticMetrics",
      filePath: "src/diagnostics/metrics.ts",
      reasonRelevant: "Derives source fullness and blocked-harvest diagnostic metrics."
    },
    {
      contextId: "CODE-006",
      subsystem: "Diagnostic telemetry emission",
      symbol: "recordDiagnosticTelemetry",
      filePath: "src/private-testing/bot-telemetry.ts",
      reasonRelevant: "Emits the structured telemetry that deterministic reports consume."
    }
  ];
}

function injectedFaults(report: DiagnosticReport): string[] {
  const diagnostics = report.scenario?.diagnostics ?? {};
  return Object.entries(diagnostics)
    .filter(([name]) => name.includes("Delay") || name.includes("haulerLoss"))
    .map(([name, value]) => `${name}=${String(value)}`);
}

function enforceSerializedLimit(request: DiagnosticAnalysisRequest): DiagnosticAnalysisRequest {
  const maxBytes = request.contextLimits.maxSerializedContextBytes ?? 48_000;
  if (Buffer.byteLength(JSON.stringify(request), "utf8") <= maxBytes) {
    return request;
  }
  return {
    ...request,
    timeline: [],
    omittedEvidenceSummary: `${request.omittedEvidenceSummary}; timeline removed to stay below serialized context size limit`
  };
}
