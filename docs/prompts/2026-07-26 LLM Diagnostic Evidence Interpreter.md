# Add the LLM Diagnostic Evidence Interpreter

The repository now contains a verified deterministic diagnostic vertical slice for the critical-hauler-loss scenarios.

Existing functionality includes:

- Structured diagnostic telemetry
- Derived metric calculation
- Deterministic diagnostic rules
- JSON and Markdown reports
- Delayed-replacement and prompt-replacement control scenarios
- Verified private-server execution
- Correlated root-cause findings backed by structured evidence

Implement the next diagnostic-autonomy vertical slice: an LLM-assisted evidence interpreter.

## Objective

Given an existing deterministic diagnostic report, invoke an LLM to:

- Explain the finding clearly.
- Evaluate whether the deterministic conclusion is supported by the evidence.
- Rank plausible code-level causes.
- Identify contradictory or missing evidence.
- Recommend bounded investigations.
- Suggest reproduction and regression-test improvements.
- Produce structured JSON and Markdown analysis artifacts.

The LLM must not:

- Create deterministic findings.
- Change finding severity.
- change diagnostic thresholds.
- Modify bot code.
- Modify scenarios.
- Create commits or pull requests.
- Deploy changes.
- Treat unsupported speculation as fact.

The deterministic diagnostic report remains the source of truth.

## Required Workflow

Implement this workflow:

Existing diagnostic-report.json  
→ Validate report  
→ Select relevant evidence  
→ Build bounded analysis context  
→ Invoke LLM  
→ Validate structured response  
→ Check all claims against supplied evidence  
→ Produce llm-analysis.json  
→ Produce llm-analysis.md

Add a command similar to:

npm run diagnostics:analyze -- &lt;path-to-diagnostic-report.json&gt;

Also support an end-to-end command for the existing scenario:

npm run diagnostics:critical-hauler-loss:analyze

Use repository naming conventions where existing command patterns suggest better names.

## Architectural Boundaries

Add logical modules equivalent to:

src/diagnostics/analysis/  
analysis-contracts.ts  
evidence-selector.ts  
diagnostic-context-builder.ts  
diagnostic-analysis-client.ts  
structured-response-validator.ts  
evidence-claim-validator.ts  
diagnostic-analysis-service.ts  
analysis-report-renderer.ts

Do not place LLM API calls inside:

Metric calculation  
Diagnostic rule evaluation  
Scenario execution  
Bot runtime code  
Report generation for deterministic findings

Use dependency inversion around the LLM provider.

export interface DiagnosticAnalysisClient {  
analyze(  
request: DiagnosticAnalysisRequest  
): Promise&lt;DiagnosticAnalysisResponse&gt;;  
}

Provide:

OpenAiDiagnosticAnalysisClient  
FakeDiagnosticAnalysisClient

The fake implementation must support deterministic unit and integration tests without network access.

## Input Contract

Create an explicit request contract equivalent to:

export interface DiagnosticAnalysisRequest {  
analysisVersion: string;  
run: {  
runId: string;  
scenarioId: string;  
codeVersion?: string;  
};  
scenarioSummary: {  
objective?: string;  
injectedFaults?: string\[\];  
successCriteria?: string\[\];  
};  
deterministicFindings: AnalysisFindingInput\[\];  
selectedMetrics: AnalysisMetricInput\[\];  
timeline: AnalysisTimelineEvent\[\];  
relevantConfiguration: Record&lt;string, string | number | boolean&gt;;  
codeContext?: AnalysisCodeContext\[\];  
instructions: {  
requireEvidenceReferences: true;  
distinguishFactsFromHypotheses: true;  
reportContradictions: true;  
reportEvidenceGaps: true;  
};  
}

Every supplied observation, metric, timeline event, and code reference must have a stable evidence ID.

Example:

export interface AnalysisEvidence {  
evidenceId: string;  
evidenceType:  
| "finding"  
| "observation"  
| "metric"  
| "timeline"  
| "configuration"  
| "code";  
description: string;  
value?: string | number | boolean;  
unit?: string;  
firstTick?: number;  
lastTick?: number;  
sourcePath?: string;  
}

## Evidence Selection

Do not send the entire telemetry history to the LLM.

Implement an EvidenceSelector that selects only evidence relevant to the deterministic findings.

For each finding, include:

- Finding identity
- Severity and confidence
- Supporting observations
- Contradicting evidence
- Related metric summaries
- Relevant timeline events
- Threshold configuration used
- Relevant room and entity identities
- Closely related findings
- Scenario fault-injection details
- Code version

Use bounded limits such as:

Maximum findings  
Maximum observations per finding  
Maximum timeline events  
Maximum metrics  
Maximum code-context entries  
Maximum serialized context size

Make all limits configurable.

When evidence exceeds the limit:

- Preserve all evidence directly referenced by deterministic findings.
- Preserve contradictory evidence.
- Preserve causal-sequence timeline events.
- Summarize lower-priority repetitive evidence.
- Record what was omitted.

The generated context must include an omittedEvidenceSummary.

## Code Context

Add a small deterministic subsystem-to-code map.

For the current scenario, map relevant concepts to files or symbols such as:

Hauler demand calculation  
Spawn request creation  
Spawn request prioritization  
Creep replacement policy  
Source-container monitoring  
Diagnostic telemetry emission

Do not implement repository-wide embeddings yet.

The code context should include:

export interface AnalysisCodeContext {  
contextId: string;  
subsystem: string;  
symbol?: string;  
filePath: string;  
reasonRelevant: string;  
recentChangeSummary?: string;  
}

Include file contents only when explicitly configured.

Default behavior should provide:

- File path
- Symbol
- Architectural responsibility
- Relevant recent diff summary when available

Do not send secrets, environment variables, generated artifacts, dependency directories, or unrelated source files.

## LLM Structured Output

Require structured output equivalent to:

export interface DiagnosticAnalysisResponse {  
analysisVersion: string;  
findingAssessments: FindingAssessment\[\];  
overallAssessment: OverallAssessment;  
recommendedInvestigations: RecommendedInvestigation\[\];  
reproductionAssessment: ReproductionAssessment;  
evidenceGaps: EvidenceGap\[\];  
unsupportedClaims: UnsupportedClaim\[\];  
}  
<br/>export interface FindingAssessment {  
findingId: string;  
conclusion:  
| "supported"  
| "partially-supported"  
| "unsupported"  
| "contradicted";  
explanation: string;  
citedEvidenceIds: string\[\];  
causalHypotheses: CausalHypothesis\[\];  
alternativeExplanations: AlternativeExplanation\[\];  
missingEvidenceIds?: string\[\];  
}  
<br/>export interface CausalHypothesis {  
hypothesisId: string;  
description: string;  
confidence:  
| "high"  
| "medium"  
| "low";  
supportingEvidenceIds: string\[\];  
contradictingEvidenceIds: string\[\];  
relevantCodeContextIds: string\[\];  
verificationSteps: string\[\];  
}  
<br/>export interface AlternativeExplanation {  
description: string;  
supportingEvidenceIds: string\[\];  
evidenceNeeded: string\[\];  
}  
<br/>export interface RecommendedInvestigation {  
priority: number;  
title: string;  
rationale: string;  
relatedFindingIds: string\[\];  
relatedEvidenceIds: string\[\];  
relevantCodeContextIds: string\[\];  
steps: string\[\];  
expectedObservation: string;  
stopCondition: string;  
}  
<br/>export interface EvidenceGap {  
description: string;  
whyItMatters: string;  
suggestedTelemetry?: string\[\];  
}  
<br/>export interface UnsupportedClaim {  
claim: string;  
reasonUnsupported: string;  
}

Adjust naming to fit project conventions while preserving the semantics.

## Prompt Requirements

Create a versioned system prompt stored as a repository artifact.

Example location:

src/diagnostics/analysis/prompts/diagnostic-analyst-v1.md

The prompt must explicitly instruct the model to:

- Treat deterministic findings as claims to evaluate, not unquestionable truth.
- Use only supplied evidence.
- Cite evidence IDs for factual statements.
- Separate observed facts from hypotheses.
- State when evidence is insufficient.
- Identify contradictions.
- Avoid assigning numerical probabilities.
- Avoid proposing broad rewrites.
- Recommend the smallest useful investigation.
- Never claim to have inspected code not included in the context.
- Never claim that a suggested cause is proven unless direct evidence establishes it.

Include the prompt version in every generated artifact.

## Evidence Claim Validation

Implement deterministic post-processing after the LLM responds.

Validate that:

- Every referenced finding ID exists.
- Every referenced evidence ID exists.
- Every referenced code-context ID exists.
- Every hypothesis has supporting evidence.
- High-confidence hypotheses have:
  - at least two supporting evidence references, or
  - one direct causal observation.
- Every factual conclusion has at least one evidence reference.
- Unsupported claims are explicitly separated.
- No response field exceeds configured size limits.

When validation fails:

- Do not silently accept the response.
- Retry once with validation feedback when configured.
- If the retry fails, save the invalid response separately.
- Produce a failed-analysis artifact explaining the validation errors.
- Do not overwrite a previously valid analysis.

## Provider Configuration

Read provider configuration from environment variables or the repository's existing configuration mechanism.

Support values equivalent to:

DIAGNOSTIC_ANALYSIS_ENABLED  
DIAGNOSTIC_ANALYSIS_PROVIDER  
DIAGNOSTIC_ANALYSIS_MODEL  
DIAGNOSTIC_ANALYSIS_API_KEY  
DIAGNOSTIC_ANALYSIS_MAX_INPUT_TOKENS  
DIAGNOSTIC_ANALYSIS_MAX_OUTPUT_TOKENS  
DIAGNOSTIC_ANALYSIS_TIMEOUT_MS  
DIAGNOSTIC_ANALYSIS_RETRY_COUNT

Requirements:

- Never commit credentials.
- Never print API keys.
- Redact sensitive configuration from logs.
- The system must remain fully functional with LLM analysis disabled.
- Unit tests and normal verification must not require an API key.
- Network-backed tests must be opt-in.

Use the official provider SDK if the repository already has an appropriate dependency strategy. Otherwise isolate the provider implementation sufficiently that the SDK can be replaced.

## Analysis Artifacts

For a successful analysis, create:

artifacts/diagnostics/{runId}/analysis/diagnostic-analysis-context.json  
artifacts/diagnostics/{runId}/analysis/diagnostic-analysis-response.json  
artifacts/diagnostics/{runId}/analysis/diagnostic-analysis.json  
artifacts/diagnostics/{runId}/analysis/diagnostic-analysis.md

### Context artifact

Contains the bounded request sent to the model, excluding secrets.

### Raw response artifact

Contains the original structured provider response.

### Validated JSON artifact

Contains:

Run metadata  
Deterministic report path  
Prompt version  
Provider and model metadata  
Context limits  
Omitted evidence summary  
Validated analysis  
Validation results  
Invocation duration  
Token usage when provided

### Markdown report

Render:

Scenario and run  
Deterministic findings  
LLM assessment of each finding  
Observed facts  
Likely causes  
Alternative explanations  
Contradictory evidence  
Evidence gaps  
Recommended investigations  
Reproduction assessment  
Validation status

Every substantive claim in Markdown must display evidence references such as:

Evidence: OBS-004, METRIC-012, EVENT-019

## Current Scenario Expectations

Analyze the existing delayed scenario report:

artifacts/diagnostics/observed-critical-hauler-loss-with-containers/diagnostic-report.json

Expected behavior:

- The correlated finding should normally be assessed as supported.
- The analysis should recognize that hauling capacity loss preceded source backpressure.
- It should identify replacement delay as a supported causal factor.
- It should mention spawn prioritization only when the report contains evidence that other requests were placed ahead of the replacement.
- It should identify any telemetry needed to distinguish:
  - bad demand calculation,
  - delayed request creation,
  - bad request priority,
  - slow spawning,
  - inadequate replacement body,
  - pathing or congestion problems.

Analyze the control report:

artifacts/diagnostics/observed-critical-hauler-loss-control-with-containers/diagnostic-report.json

Expected behavior:

- It must not invent the correlated delayed-replacement finding.
- It should explain that the control case demonstrates successful or timely recovery when supported by the evidence.
- It may identify residual inefficiencies, but must distinguish them from the absent delayed-replacement root cause.

## Testing Requirements

Use test-driven development.

Add tests for:

- Evidence ID generation.
- Evidence selection.
- Context size enforcement.
- Preservation of contradictory evidence.
- Omitted-evidence summaries.
- Code-context selection.
- Prompt version inclusion.
- Fake client behavior.
- Structured response parsing.
- Unknown evidence reference rejection.
- Unknown code-context reference rejection.
- Unsupported factual-claim rejection.
- High-confidence hypothesis validation.
- Retry after invalid response.
- Failed-analysis artifact generation.
- Markdown evidence rendering.
- Analysis-disabled behavior.
- Delayed scenario analysis with a deterministic fake response.
- Control scenario analysis with a deterministic fake response.

All existing tests must remain green.

The default:

npm run verify

must not perform network calls.

Add an opt-in real-provider smoke test command, but exclude it from normal verification.

## Documentation

Add documentation covering:

- Architecture
- Deterministic versus LLM responsibilities
- Configuration
- Security considerations
- Context selection
- Evidence validation
- Commands
- Artifact locations
- Cost and token controls
- Failure handling
- How to add another provider
- How to update the versioned prompt

Clearly state:

The LLM explains and challenges deterministic diagnostic findings.  
It does not establish the findings and is not an approval authority.

## Constraints

- Do not change existing diagnostic rule outcomes merely to make the LLM analysis easier.
- Do not embed provider-specific types throughout the diagnostics domain.
- Do not add a vector database.
- Do not add embeddings.
- Do not add machine learning.
- Do not build a UI.
- Do not create GitHub issues.
- Do not modify gameplay behavior.
- Do not send complete repository contents to the model.
- Do not require an LLM for simulations or deterministic reporting.
- Do not allow free-form unvalidated model output to become an official analysis artifact.

## Deliverables

Complete the implementation and report:

- Architecture added.
- Files created and modified.
- Input and output contracts.
- Evidence-selection rules.
- Validation rules.
- Prompt version and path.
- Provider configuration.
- Commands for:
  - fake-client analysis,
  - delayed scenario analysis,
  - control scenario analysis,
  - opt-in real-provider smoke test.
- Sample analysis artifact paths.
- Test results.
- Limitations.
- Recommended next diagnostic domain.

Do not stop after adding interfaces or prompt files.

The task is complete only when an existing deterministic diagnostic report can be analyzed through the fake client during normal tests and through the configured real provider using an opt-in command, producing validated JSON and Markdown artifacts with traceable evidence references.