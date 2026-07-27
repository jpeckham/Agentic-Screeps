export interface DiagnosticReport {
  metadata?: {
    runId?: string;
    scenarioId?: string;
    codeVersion?: string;
  };
  scenario?: {
    name?: string;
    description?: string;
    diagnostics?: Record<string, string | number | boolean | undefined>;
    assertions?: Array<{ label?: string; type?: string }>;
  };
  configuration?: Record<string, string | number | boolean>;
  outcome?: string;
  metrics?: Record<string, number>;
  findings?: DiagnosticReportFinding[];
  invariantViolations?: string[];
  artifactReferences?: string[];
}

export interface DiagnosticReportFinding {
  findingId: string;
  runId?: string;
  scenarioId?: string;
  ruleId: string;
  severity: string;
  confidence: string;
  title: string;
  summary: string;
  firstObservedTick?: number;
  lastObservedTick?: number;
  affectedRoom?: string;
  observations?: Array<{
    description?: string;
    metricName?: string;
    observedValue?: number;
    expectedValue?: number;
    tickRange?: { from: number; to: number };
  }>;
  hypotheses?: Array<{
    cause?: string;
    confidenceScore?: number;
    supportingEvidence?: string[];
    contradictingEvidence?: string[];
  }>;
  recommendedInvestigation?: string[];
}
