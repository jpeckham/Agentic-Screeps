export const DIAGNOSTIC_ANALYSIS_PROMPT_VERSION = "diagnostic-analyst-v1";
export const DIAGNOSTIC_ANALYSIS_PROMPT_PATH = "src/diagnostics/analysis/prompts/diagnostic-analyst-v1.md";

export interface DiagnosticAnalysisRequest {
  analysisVersion: string;
  run: {
    runId: string;
    scenarioId: string;
    codeVersion?: string | undefined;
  };
  scenarioSummary: {
    objective?: string | undefined;
    injectedFaults?: string[] | undefined;
    successCriteria?: string[] | undefined;
  };
  deterministicFindings: AnalysisFindingInput[];
  selectedMetrics: AnalysisMetricInput[];
  timeline: AnalysisTimelineEvent[];
  relevantConfiguration: Record<string, string | number | boolean>;
  codeContext?: AnalysisCodeContext[] | undefined;
  instructions: {
    requireEvidenceReferences: true;
    distinguishFactsFromHypotheses: true;
    reportContradictions: true;
    reportEvidenceGaps: true;
  };
  evidence: AnalysisEvidence[];
  omittedEvidenceSummary: string;
  contextLimits: Required<AnalysisContextLimits>;
  validationFeedback?: string[] | undefined;
}

export interface AnalysisFindingInput {
  findingId: string;
  ruleId: string;
  severity: string;
  confidence: string;
  title: string;
  summary: string;
  firstObservedTick?: number | undefined;
  lastObservedTick?: number | undefined;
  affectedRoom?: string | undefined;
  citedEvidenceIds: string[];
}

export interface AnalysisMetricInput {
  evidenceId: string;
  metricName: string;
  value: string | number | boolean;
  unit?: string | undefined;
  description: string;
}

export interface AnalysisTimelineEvent {
  evidenceId: string;
  tick: number;
  eventType: string;
  subsystem?: string | undefined;
  entityId?: string | undefined;
  description: string;
}

export interface AnalysisEvidence {
  evidenceId: string;
  evidenceType: "finding" | "observation" | "metric" | "timeline" | "configuration" | "code";
  description: string;
  value?: string | number | boolean | undefined;
  unit?: string | undefined;
  firstTick?: number | undefined;
  lastTick?: number | undefined;
  sourcePath?: string | undefined;
}

export interface AnalysisCodeContext {
  contextId: string;
  subsystem: string;
  symbol?: string | undefined;
  filePath: string;
  reasonRelevant: string;
  recentChangeSummary?: string | undefined;
  contents?: string | undefined;
}

export interface AnalysisContextLimits {
  maxFindings?: number | undefined;
  maxObservationsPerFinding?: number | undefined;
  maxTimelineEvents?: number | undefined;
  maxMetrics?: number | undefined;
  maxCodeContextEntries?: number | undefined;
  maxSerializedContextBytes?: number | undefined;
}

export interface DiagnosticAnalysisResponse {
  analysisVersion: string;
  findingAssessments: FindingAssessment[];
  overallAssessment: OverallAssessment;
  recommendedInvestigations: RecommendedInvestigation[];
  reproductionAssessment: ReproductionAssessment;
  evidenceGaps: EvidenceGap[];
  unsupportedClaims: UnsupportedClaim[];
}

export interface FindingAssessment {
  findingId: string;
  conclusion: "supported" | "partially-supported" | "unsupported" | "contradicted";
  explanation: string;
  citedEvidenceIds: string[];
  causalHypotheses: CausalHypothesis[];
  alternativeExplanations: AlternativeExplanation[];
  missingEvidenceIds?: string[] | undefined;
}

export interface CausalHypothesis {
  hypothesisId: string;
  description: string;
  confidence: "high" | "medium" | "low";
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  relevantCodeContextIds: string[];
  verificationSteps: string[];
}

export interface AlternativeExplanation {
  description: string;
  supportingEvidenceIds: string[];
  evidenceNeeded: string[];
}

export interface OverallAssessment {
  summary: string;
  citedEvidenceIds: string[];
}

export interface RecommendedInvestigation {
  priority: number;
  title: string;
  rationale: string;
  relatedFindingIds: string[];
  relatedEvidenceIds: string[];
  relevantCodeContextIds: string[];
  steps: string[];
  expectedObservation: string;
  stopCondition: string;
}

export interface ReproductionAssessment {
  summary: string;
  citedEvidenceIds: string[];
}

export interface EvidenceGap {
  description: string;
  whyItMatters: string;
  suggestedTelemetry?: string[] | undefined;
}

export interface UnsupportedClaim {
  claim: string;
  reasonUnsupported: string;
}

export interface DiagnosticAnalysisClient {
  analyze(request: DiagnosticAnalysisRequest): Promise<DiagnosticAnalysisResponse>;
}

export interface AnalysisValidationResult {
  valid: boolean;
  errors: string[];
}

export const DEFAULT_ANALYSIS_CONTEXT_LIMITS: Required<AnalysisContextLimits> = {
  maxFindings: 8,
  maxObservationsPerFinding: 6,
  maxTimelineEvents: 20,
  maxMetrics: 12,
  maxCodeContextEntries: 8,
  maxSerializedContextBytes: 48_000
};
