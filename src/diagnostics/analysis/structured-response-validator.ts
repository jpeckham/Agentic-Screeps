import type { DiagnosticAnalysisResponse } from "./analysis-contracts.js";

export function parseDiagnosticAnalysisResponse(value: unknown): DiagnosticAnalysisResponse {
  if (!isRecord(value)) throw new Error("Diagnostic analysis response must be an object.");
  const response = value as Partial<DiagnosticAnalysisResponse>;
  if (!Array.isArray(response.findingAssessments)) throw new Error("Diagnostic analysis response missing findingAssessments.");
  if (!isRecord(response.overallAssessment)) throw new Error("Diagnostic analysis response missing overallAssessment.");
  if (!Array.isArray(response.recommendedInvestigations)) throw new Error("Diagnostic analysis response missing recommendedInvestigations.");
  if (!isRecord(response.reproductionAssessment)) throw new Error("Diagnostic analysis response missing reproductionAssessment.");
  if (!Array.isArray(response.evidenceGaps)) throw new Error("Diagnostic analysis response missing evidenceGaps.");
  if (!Array.isArray(response.unsupportedClaims)) throw new Error("Diagnostic analysis response missing unsupportedClaims.");
  return response as DiagnosticAnalysisResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
