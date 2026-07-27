import type {
  AnalysisValidationResult,
  DiagnosticAnalysisRequest,
  DiagnosticAnalysisResponse,
  FindingAssessment
} from "./analysis-contracts.js";

export function validateDiagnosticAnalysisResponse(
  response: DiagnosticAnalysisResponse,
  context: DiagnosticAnalysisRequest
): AnalysisValidationResult {
  const errors: string[] = [];
  const evidenceIds = new Set(context.evidence.map((item) => item.evidenceId));
  const findingIds = new Set(context.deterministicFindings.map((finding) => finding.findingId));
  const codeContextIds = new Set((context.codeContext ?? []).map((item) => item.contextId));

  if (response.analysisVersion !== context.analysisVersion) {
    errors.push(`Response analysisVersion ${response.analysisVersion} does not match ${context.analysisVersion}.`);
  }
  for (const assessment of response.findingAssessments) {
    validateFindingAssessment(assessment, findingIds, evidenceIds, codeContextIds, errors);
  }
  for (const cited of response.overallAssessment.citedEvidenceIds) validateEvidence(cited, evidenceIds, errors);
  if (response.overallAssessment.citedEvidenceIds.length === 0) errors.push("Overall assessment must cite evidence.");
  for (const cited of response.reproductionAssessment.citedEvidenceIds) validateEvidence(cited, evidenceIds, errors);
  if (response.reproductionAssessment.citedEvidenceIds.length === 0) errors.push("Reproduction assessment must cite evidence.");
  for (const investigation of response.recommendedInvestigations) {
    for (const findingId of investigation.relatedFindingIds) {
      if (!findingIds.has(findingId)) errors.push(`Unknown finding ID referenced: ${findingId}`);
    }
    for (const evidenceId of investigation.relatedEvidenceIds) validateEvidence(evidenceId, evidenceIds, errors);
    for (const contextId of investigation.relevantCodeContextIds) validateCodeContext(contextId, codeContextIds, errors);
  }
  for (const [path, value] of responseStrings(response)) {
    if (value.length > 2_000) errors.push(`${path} exceeds maximum field length.`);
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function validateFindingAssessment(
  assessment: FindingAssessment,
  findingIds: Set<string>,
  evidenceIds: Set<string>,
  codeContextIds: Set<string>,
  errors: string[]
): void {
  if (!findingIds.has(assessment.findingId)) errors.push(`Unknown finding ID referenced: ${assessment.findingId}`);
  if (assessment.citedEvidenceIds.length === 0) {
    errors.push(`Finding assessment ${assessment.findingId} must cite evidence.`);
  }
  for (const cited of assessment.citedEvidenceIds) validateEvidence(cited, evidenceIds, errors);
  for (const hypothesis of assessment.causalHypotheses) {
    if (hypothesis.supportingEvidenceIds.length === 0) {
      errors.push(`Hypothesis ${hypothesis.hypothesisId} must cite supporting evidence.`);
    }
    for (const cited of hypothesis.supportingEvidenceIds) validateEvidence(cited, evidenceIds, errors);
    for (const cited of hypothesis.contradictingEvidenceIds) validateEvidence(cited, evidenceIds, errors);
    for (const contextId of hypothesis.relevantCodeContextIds) validateCodeContext(contextId, codeContextIds, errors);
    if (hypothesis.confidence === "high" && hypothesis.supportingEvidenceIds.length < 2) {
      errors.push(`High-confidence hypothesis ${hypothesis.hypothesisId} must cite at least two supporting evidence IDs or one direct causal observation.`);
    }
  }
  for (const alternative of assessment.alternativeExplanations) {
    for (const cited of alternative.supportingEvidenceIds) validateEvidence(cited, evidenceIds, errors);
  }
}

function validateEvidence(evidenceId: string, evidenceIds: Set<string>, errors: string[]): void {
  if (!evidenceIds.has(evidenceId)) errors.push(`Unknown evidence ID referenced: ${evidenceId}`);
}

function validateCodeContext(contextId: string, codeContextIds: Set<string>, errors: string[]): void {
  if (!codeContextIds.has(contextId)) errors.push(`Unknown code context ID referenced: ${contextId}`);
}

function responseStrings(value: unknown, path = "response"): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => responseStrings(item, `${path}[${index}]`));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => responseStrings(item, `${path}.${key}`));
  }
  return [];
}
