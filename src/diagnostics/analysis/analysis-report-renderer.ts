import type { DiagnosticAnalysisRequest, DiagnosticAnalysisResponse } from "./analysis-contracts.js";

export interface DiagnosticAnalysisMarkdownInput {
  context: DiagnosticAnalysisRequest;
  response: DiagnosticAnalysisResponse;
  validationErrors: string[];
}

export function renderDiagnosticAnalysisMarkdown(input: DiagnosticAnalysisMarkdownInput): string {
  const lines = [
    `# LLM Diagnostic Analysis: ${input.context.run.scenarioId}`,
    "",
    `Run: ${input.context.run.runId}`,
    `Prompt version: ${input.context.analysisVersion}`,
    "",
    "## Deterministic Findings",
    ...input.context.deterministicFindings.map((finding) =>
      `- ${finding.ruleId}: ${finding.title} (${finding.severity}, ${finding.confidence}) Evidence: ${finding.citedEvidenceIds.join(", ")}`
    ),
    "",
    "## LLM Assessment"
  ];

  for (const assessment of input.response.findingAssessments) {
    lines.push(`- ${assessment.findingId}: ${assessment.conclusion}`);
    lines.push(`  ${assessment.explanation} Evidence: ${assessment.citedEvidenceIds.join(", ")}`);
    for (const hypothesis of assessment.causalHypotheses) {
      lines.push(`  Cause: ${hypothesis.description} Evidence: ${hypothesis.supportingEvidenceIds.join(", ")}`);
    }
    for (const alternative of assessment.alternativeExplanations) {
      lines.push(`  Alternative: ${alternative.description} Evidence: ${alternative.supportingEvidenceIds.join(", ") || "none supplied"}`);
    }
  }

  lines.push(
    "",
    "## Observed Facts",
    ...input.context.evidence
      .filter((item) => item.evidenceType !== "code")
      .slice(0, 20)
      .map((item) => `- ${item.description} Evidence: ${item.evidenceId}`),
    "",
    "## Likely Causes",
    ...input.response.findingAssessments.flatMap((assessment) =>
      assessment.causalHypotheses.map((hypothesis) => `- ${hypothesis.description} Evidence: ${hypothesis.supportingEvidenceIds.join(", ")}`)
    ),
    "",
    "## Alternative Explanations",
    ...input.response.findingAssessments.flatMap((assessment) =>
      assessment.alternativeExplanations.map((alternative) => `- ${alternative.description} Evidence: ${alternative.supportingEvidenceIds.join(", ") || "none supplied"}`)
    ),
    "",
    "## Contradictory Evidence",
    ...contradictoryEvidenceLines(input),
    "",
    "## Evidence Gaps",
    ...input.response.evidenceGaps.map((gap) => `- ${gap.description}: ${gap.whyItMatters}`),
    "",
    "## Recommended Investigations",
    ...input.response.recommendedInvestigations
      .slice()
      .sort((left, right) => left.priority - right.priority)
      .map((item) => `- P${item.priority} ${item.title}: ${item.rationale} Evidence: ${item.relatedEvidenceIds.join(", ")}`),
    "",
    "## Reproduction Assessment",
    `${input.response.reproductionAssessment.summary} Evidence: ${input.response.reproductionAssessment.citedEvidenceIds.join(", ")}`,
    "",
    "## Unsupported Claims",
    ...input.response.unsupportedClaims.map((claim) => `- ${claim.claim}: ${claim.reasonUnsupported}`),
    "",
    "## Validation Status",
    input.validationErrors.length === 0 ? "- Validated response." : `- Failed validation: ${input.validationErrors.join("; ")}`
  );

  return `${lines.join("\n")}\n`;
}

function contradictoryEvidenceLines(input: DiagnosticAnalysisMarkdownInput): string[] {
  const cited = input.response.findingAssessments.flatMap((assessment) =>
    assessment.causalHypotheses.flatMap((hypothesis) => hypothesis.contradictingEvidenceIds)
  );
  const ids = cited.length > 0 ? cited : input.context.evidence.filter((item) => item.description.includes("contradicts")).map((item) => item.evidenceId);
  if (ids.length === 0) return ["- None identified in supplied evidence."];
  return ids.map((id) => {
    const evidence = input.context.evidence.find((item) => item.evidenceId === id);
    return `- ${evidence?.description ?? "Contradictory evidence cited."} Evidence: ${id}`;
  });
}
