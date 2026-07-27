Fix the real-provider diagnostic-analysis smoke command.

## Observed failure

Running:

npm run diagnostics:analyze:real-smoke

executes:

node scripts/analyze-diagnostic-report.mjs artifacts/diagnostics/observed-critical-hauler-loss-with-containers/diagnostic-report.json --real-provider-smoke

but fails with:

Error: No default fake response is configured. Pass FakeDiagnosticAnalysisClient explicitly for deterministic analysis.

The stack trace shows createConfiguredClient() selecting or falling through to the fake-client path instead of creating the real provider client.

## Objective

Make the opt-in real-provider smoke command unambiguously select OpenAiDiagnosticAnalysisClient.

Do not silently fall back to the fake client when real-provider mode was explicitly requested.

## Required investigation

Trace the complete option flow through:

package.json script  
→ scripts/analyze-diagnostic-report.mjs  
→ CLI argument parsing  
→ analyzeDiagnosticReport options  
→ createConfiguredClient  
→ OpenAiDiagnosticAnalysisClient

Determine exactly where --real-provider-smoke is lost, renamed, ignored, or overridden.

Also determine whether the .tmp/analyze-diagnostic-report-cli.mjs bundle is regenerated before execution or may be stale.

## Required behavior

### Fake mode

This command must use the deterministic fake client:

npm run diagnostics:analyze -- &lt;report.json&gt; --fake

A fake response must either be explicitly supplied or deterministically selected for the known scenario.

### Real-provider mode

This command must use the real OpenAI client:

npm run diagnostics:analyze:real-smoke

Equivalent direct invocation:

node scripts/analyze-diagnostic-report.mjs &lt;report.json&gt; --real-provider-smoke

When --real-provider-smoke is present:

- Select OpenAiDiagnosticAnalysisClient.
- Never instantiate FakeDiagnosticAnalysisClient.
- Never require a fake response.
- Validate required provider configuration.
- Print a concise provider-mode message without exposing secrets, for example:

Diagnostic analysis provider: OpenAI  
Model: &lt;configured model&gt;  
Mode: real-provider smoke test

- Execute one bounded analysis request.
- Generate the validated analysis artifacts.

## Configuration validation

In real-provider mode, validate the actual environment variables used by the implementation, including equivalents of:

DIAGNOSTIC_ANALYSIS_ENABLED  
DIAGNOSTIC_ANALYSIS_PROVIDER  
DIAGNOSTIC_ANALYSIS_MODEL  
DIAGNOSTIC_ANALYSIS_API_KEY

If required configuration is missing, fail with an actionable message such as:

Real-provider analysis was requested, but DIAGNOSTIC_ANALYSIS_API_KEY is not configured.

Do not emit a fake-client error when real-provider configuration is missing.

Clarify whether DIAGNOSTIC_ANALYSIS_ENABLED must be set for an explicit smoke command. Prefer explicit CLI real-provider mode to enable analysis for that invocation while still requiring provider, model, and API-key configuration.

## Provider selection precedence

Implement explicit precedence:

Explicit --real-provider-smoke  
\> explicit --fake  
\> injected client  
\> configured default provider

Reject contradictory arguments:

\--fake --real-provider-smoke

with a clear error.

Represent the mode with one discriminated value rather than several loosely related booleans where practical:

type DiagnosticAnalysisMode =  
| "fake"  
| "configured"  
| "real-provider-smoke";

## Stale bundle handling

The stack trace executes:

.tmp/analyze-diagnostic-report-cli.mjs

Ensure the command rebuilds this bundle from current source before execution, or removes reliance on a stale generated file.

The npm script must not accidentally execute an old bundle after source changes.

## Tests

Add tests proving:

- \--fake selects the fake client.
- \--real-provider-smoke selects the OpenAI client.
- Real mode does not request a fake response.
- Missing API key produces a provider-configuration error.
- Unknown provider produces a clear error.
- Contradictory mode flags are rejected.
- Explicit real mode takes precedence over configured fake defaults.
- Parsed CLI options reach createConfiguredClient.
- The real-smoke npm script passes the correct argument.
- Normal npm run verify makes no network calls.

Use a spy or fake factory around OpenAI client construction so tests do not make network calls.

## Verification

Run:

npm run verify  
npm run diagnostics:critical-hauler-loss:analyze  
npm run diagnostics:critical-hauler-loss-control:analyze

Then validate the real command reaches the real client initialization path without exposing the API key.

When credentials are available, run:

npm run diagnostics:analyze:real-smoke

## Deliverables

Report:

- Root cause.
- Files changed.
- Provider-selection precedence.
- Required environment variables.
- Exact PowerShell commands for setting configuration temporarily.
- Test results.
- Whether the real provider invocation completed.
- Generated artifact paths.

Do not merely change the thrown error. Fix the provider-selection flow so the real smoke command actually uses the real provider.