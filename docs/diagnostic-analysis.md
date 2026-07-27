# LLM Diagnostic Evidence Interpreter

The LLM diagnostic interpreter explains and challenges deterministic diagnostic findings. It does not establish findings and is not an approval authority. The deterministic `diagnostic-report.json` remains the source of truth for rule outcomes, severity, confidence, and thresholds.

## Architecture

Analysis code lives under `src/diagnostics/analysis/`:

- `analysis-contracts.ts` defines request, response, evidence, code-context, and client contracts.
- `evidence-selector.ts` validates and bounds report evidence before model use.
- `diagnostic-context-builder.ts` creates the versioned request and deterministic subsystem-to-code map.
- `diagnostic-analysis-client.ts` isolates providers behind `DiagnosticAnalysisClient`.
- `structured-response-validator.ts` parses structured provider output.
- `evidence-claim-validator.ts` rejects unknown evidence, unknown code context, unsupported factual conclusions, and weak high-confidence hypotheses.
- `diagnostic-analysis-service.ts` orchestrates artifact writing, retry, disabled mode, and provider configuration.
- `analysis-report-renderer.ts` renders Markdown with evidence IDs.
- `prompts/diagnostic-analyst-v1.md` is the versioned system prompt.

LLM calls are not in metric calculation, deterministic rule evaluation, scenario execution, bot runtime code, or deterministic report generation.

## Configuration And Security

Use environment variables:

- `DIAGNOSTIC_ANALYSIS_ENABLED`
- `DIAGNOSTIC_ANALYSIS_PROVIDER` (`disabled`, `fake`, `openai`)
- `DIAGNOSTIC_ANALYSIS_MODEL`
- `DIAGNOSTIC_ANALYSIS_API_KEY`
- `OPENAI_API_KEY` as a fallback when `DIAGNOSTIC_ANALYSIS_API_KEY` is empty
- `DIAGNOSTIC_ANALYSIS_MAX_INPUT_TOKENS`
- `DIAGNOSTIC_ANALYSIS_MAX_OUTPUT_TOKENS`
- `DIAGNOSTIC_ANALYSIS_TIMEOUT_MS`
- `DIAGNOSTIC_ANALYSIS_RETRY_COUNT`

API keys are never required for unit tests, normal verification, or fake analysis. Configuration redaction replaces the API key with `[redacted]`. Do not commit credentials. Network-backed provider use is opt-in through `diagnostics:analyze:real-smoke` or an explicit `DIAGNOSTIC_ANALYSIS_PROVIDER=openai` run.

## Context Selection

The selector does not send full telemetry history. It includes bounded findings, observations, metric summaries, causal timeline points, threshold configuration, room/scenario details, code version, and deterministic code-context references. Limits cover findings, observations per finding, timeline events, metrics, code-context entries, and serialized context size.

When evidence exceeds limits, directly selected findings and observations are kept first, contradictory metrics are preserved, lower-priority evidence is omitted, and `omittedEvidenceSummary` records counts.

The current deterministic code-context map covers hauler demand calculation, spawn request creation, spawn request prioritization, creep replacement policy, source-container monitoring, and diagnostic telemetry emission. File contents are excluded by default.

## Validation And Failure Handling

Post-processing validates every referenced finding ID, evidence ID, and code-context ID. It also requires every hypothesis to cite support, high-confidence hypotheses to cite at least two supporting evidence IDs, factual conclusions to cite evidence, unsupported claims to be separated, and response fields to stay inside configured size limits.

If validation fails, the service retries once by default with validation feedback. If retry still fails, it writes `diagnostic-analysis-invalid-response.json` and a timestamped `failed-analysis-*.json`. A previously valid `diagnostic-analysis.json` is not overwritten by a failed analysis.

## Commands

- Fake-client analysis for any report: `npm run diagnostics:analyze -- <path-to-diagnostic-report.json> --fake`
- Delayed scenario fake analysis: `npm run diagnostics:critical-hauler-loss:analyze`
- Control scenario fake analysis: `npm run diagnostics:critical-hauler-loss-control:analyze`
- Opt-in real-provider smoke test: set `DIAGNOSTIC_ANALYSIS_PROVIDER=openai` and either `DIAGNOSTIC_ANALYSIS_API_KEY` or `OPENAI_API_KEY`, then run `npm run diagnostics:analyze:real-smoke`

Normal `npm run verify` does not perform network calls.

## Artifacts

Successful analysis writes:

- `artifacts/diagnostics/{runId}/analysis/diagnostic-analysis-context.json`
- `artifacts/diagnostics/{runId}/analysis/diagnostic-analysis-response.json`
- `artifacts/diagnostics/{runId}/analysis/diagnostic-analysis.json`
- `artifacts/diagnostics/{runId}/analysis/diagnostic-analysis.md`

The Markdown report includes scenario/run metadata, deterministic findings, LLM assessment, observed facts, likely causes, alternative explanations, contradictory evidence, evidence gaps, recommended investigations, reproduction assessment, and validation status. Substantive claims display evidence references such as `Evidence: OBS-004, METRIC-012`.

## Cost And Provider Extension

Cost controls are bounded context size, maximum input/output token configuration, timeout, and retry count. To add another provider, implement `DiagnosticAnalysisClient`, keep provider-specific types inside that adapter, return the structured response contract, and reuse the deterministic validator before writing official artifacts.

To update the prompt, add a new versioned prompt file, update `DIAGNOSTIC_ANALYSIS_PROMPT_VERSION` and `DIAGNOSTIC_ANALYSIS_PROMPT_PATH`, then update tests and docs so generated artifacts include the new version.
