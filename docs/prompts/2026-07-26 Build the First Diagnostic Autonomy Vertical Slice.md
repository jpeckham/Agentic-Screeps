# Build the First Diagnostic Autonomy Vertical Slice

We now have a private Screeps simulation environment that can run automated scenarios and test bot behavior.

Implement the first complete diagnostic vertical slice for the Screeps bot and simulation harness.

## Objective

Create an automated test scenario in which a colony loses a critical hauler and the diagnostic system determines whether the colony experiences source-container backpressure caused by insufficient hauling capacity or delayed hauler replacement.

The completed workflow must be:

Reset private simulation  
→ Load deterministic scenario  
→ Deploy bot  
→ Run for a bounded number of ticks  
→ Collect structured telemetry  
→ Calculate metrics  
→ Evaluate deterministic diagnostic rules  
→ Produce machine-readable and human-readable reports  
→ Fail the test when expected diagnostics are not produced

Do not use an LLM in this implementation.

The diagnosis must be deterministic, explainable, and testable.

## Required Scenario

Create a scenario named:

critical-hauler-loss

The scenario should:

- Start with one owned room at an appropriate controller level.
- Include:
  - one spawn,
  - two active energy sources,
  - source containers where supported,
  - miners assigned to the sources,
  - enough hauling capacity for normal operation,
  - normal spawn energy consumers.
- Allow the colony to reach a stable operating state.
- Record the stable hauling baseline.
- Remove or kill one critical hauler at a deterministic tick.
- Continue running long enough to observe:
  - hauling capacity,
  - source-container fullness,
  - miner harvesting interruptions,
  - spawn queue behavior,
  - hauler replacement timing,
  - energy delivery recovery.
- End after recovery or after a configurable maximum tick count.

All important timings, IDs, thresholds, and random seeds must be deterministic and configurable.

## Diagnostic Contracts

Create explicit contracts for telemetry and findings.

At minimum, implement equivalents of:

export interface DiagnosticEvent {  
runId: string;  
scenarioId: string;  
gameTick: number;  
roomName?: string;  
subsystem: string;  
eventType: string;  
entityId?: string;  
measurements?: Record&lt;string, number&gt;;  
context?: Record&lt;string, string | number | boolean&gt;;  
codeVersion?: string;  
}  
<br/>export interface MetricSample {  
runId: string;  
scenarioId: string;  
gameTick: number;  
roomName?: string;  
metricName: string;  
value: number;  
unit?: string;  
dimensions?: Record&lt;string, string&gt;;  
}  
<br/>export interface DiagnosticFinding {  
findingId: string;  
runId: string;  
scenarioId: string;  
ruleId: string;  
severity: "critical" | "high" | "medium" | "low" | "informational";  
confidence: "high" | "medium" | "low";  
title: string;  
summary: string;  
firstObservedTick: number;  
lastObservedTick: number;  
affectedRoom?: string;  
observations: DiagnosticObservation\[\];  
hypotheses: DiagnosticHypothesis\[\];  
recommendedInvestigation: string\[\];  
}  
<br/>export interface DiagnosticObservation {  
description: string;  
metricName?: string;  
observedValue?: number;  
expectedValue?: number;  
tickRange?: {  
from: number;  
to: number;  
};  
}  
<br/>export interface DiagnosticHypothesis {  
cause: string;  
confidenceScore: number;  
supportingEvidence: string\[\];  
contradictingEvidence: string\[\];  
}

Adjust naming to match the repository conventions, but preserve these concepts.

## Bot Telemetry

Instrument the bot to emit structured telemetry for this scenario.

At minimum, collect:

logistics.activeHaulingCapacity  
logistics.requiredHaulingCapacity  
logistics.energyDelivered  
logistics.haulerIdleTicks  
logistics.haulerEmptyTravelTicks  
logistics.replacementGapTicks  
source.containerFullness  
source.blockedHarvestTicks  
spawn.queueLength  
spawn.haulerRequestPriority  
spawn.haulerRequestWaitTicks  
room.energyAvailable  
room.energyCapacityAvailable  
cpu.total  
cpu.logistics

Also emit events for:

hauler_lost  
hauler_replacement_requested  
hauler_replacement_started  
hauler_replacement_spawned  
source_backpressure_started  
source_backpressure_ended  
miner_harvest_blocked  
delivery_completed

Telemetry must be buffered and exported through an abstraction so that the bot does not depend directly on a file, database, or simulator implementation.

Create an interface similar to:

export interface DiagnosticRecorder {  
recordEvent(event: DiagnosticEvent): void;  
recordMetric(metric: MetricSample): void;  
flush(): void;  
}

Provide:

NoOpDiagnosticRecorder  
SimulationDiagnosticRecorder

Normal bot behavior must continue to work when diagnostics are disabled.

## Metric Calculation

Implement a processor that derives the following run-level metrics:

Baseline hauling capacity  
Lowest hauling capacity after hauler loss  
Replacement request delay  
Replacement spawn delay  
Total replacement gap  
Maximum source-container fullness  
Ticks above 80% source-container fullness  
Ticks above 95% source-container fullness  
Blocked miner harvest ticks  
Energy delivered before failure  
Energy delivered during degradation  
Energy delivered after recovery  
Ticks until recovery

Definitions must be explicit and tested.

Do not bury metric calculations inside report generation.

Use separate domain logic for:

Telemetry collection  
Metric calculation  
Diagnostic rule evaluation  
Report rendering

## Deterministic Diagnostic Rules

Implement these rules.

### Rule 1: Hauling Capacity Deficit

Rule ID:

LOGISTICS_HAULING_CAPACITY_DEFICIT

Trigger when:

activeHaulingCapacity < requiredHaulingCapacity

for more than a configurable number of consecutive ticks.

The finding must include:

- capacity deficit,
- duration,
- affected room,
- first and last observed ticks.

### Rule 2: Source Backpressure

Rule ID:

LOGISTICS_SOURCE_BACKPRESSURE

Trigger when at least one source container remains above a configurable fullness threshold for a configurable duration.

Supporting evidence should include:

- maximum fullness,
- duration above threshold,
- blocked miner harvest ticks.

### Rule 3: Delayed Critical Hauler Replacement

Rule ID:

SPAWN_DELAYED_CRITICAL_HAULER_REPLACEMENT

Trigger when:

- hauling capacity is below required capacity,
- a replacement hauler is required,
- the replacement request or spawn is delayed beyond the configured tolerance.

Evidence should include:

- hauler-loss tick,
- request-created tick,
- spawn-started tick,
- spawn-completed tick,
- requests that were placed ahead of the hauler,
- request priorities where available.

### Rule 4: Correlated Root-Cause Finding

Rule ID:

LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT

Produce this correlated finding when:

Hauling capacity deficit  
AND source backpressure  
AND delayed critical hauler replacement

occur in the expected causal sequence.

The primary hypothesis should be:

Critical hauling capacity was not restored quickly enough after the hauler loss, causing energy to accumulate at the sources and interrupt mining.

If spawn-queue evidence shows lower-value creeps were spawned ahead of the replacement hauler, add a second hypothesis:

Spawn-request prioritization delayed logistics recovery.

Confidence scores must be calculated from explicit evidence weights. Do not ask an LLM to assign confidence.

## Configuration

Create a diagnostic configuration object or file containing:

capacityDeficitToleranceTicks  
sourceBackpressureThreshold  
sourceBackpressureDurationTicks  
criticalReplacementRequestToleranceTicks  
criticalReplacementSpawnToleranceTicks  
recoveryStabilityTicks  
scenarioMaximumTicks

Do not scatter thresholds through the code.

Provide sensible defaults and allow scenario-specific overrides.

## Reports

Produce two reports for every scenario run.

### JSON Report

Write a structured JSON report containing:

Run metadata  
Scenario metadata  
Code version  
Configuration  
Run outcome  
Derived metrics  
Diagnostic findings  
Invariant violations  
Artifact references

Suggested location:

artifacts/diagnostics/{runId}/diagnostic-report.json

### Markdown Report

Write a readable Markdown report containing:

Scenario  
Outcome  
Timeline  
Baseline  
Observed degradation  
Recovery  
Findings  
Evidence  
Ranked hypotheses  
Recommended investigation

Suggested location:

artifacts/diagnostics/{runId}/diagnostic-report.md

Include a compact timeline such as:

Tick 100: Stable baseline established  
Tick 200: Critical hauler removed  
Tick 201: Hauling capacity deficit begins  
Tick 215: Source backpressure begins  
Tick 238: Replacement requested  
Tick 260: Replacement spawning begins  
Tick 278: Replacement becomes active  
Tick 301: Source backpressure ends  
Tick 320: Recovery confirmed

## Automated Tests

Use test-driven development.

Implement tests for:

- Telemetry contract serialization.
- Metric calculations from fixed telemetry fixtures.
- Every diagnostic rule in isolation.
- Rule non-triggering boundary conditions.
- Correlation ordering.
- Confidence-score calculation.
- Markdown report generation.
- JSON report generation.
- The complete private-server scenario.

The complete scenario test must assert that:

LOGISTICS_HAULING_CAPACITY_DEFICIT  
LOGISTICS_SOURCE_BACKPRESSURE  
SPAWN_DELAYED_CRITICAL_HAULER_REPLACEMENT  
LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT

are produced when the configured replacement delay is intentionally excessive.

Also create a control variant where the hauler is replaced promptly. That test must assert that the correlated root-cause finding is not produced.

Avoid assertions based only on report text. Assert against the structured findings.

## Architecture Requirements

Keep this implementation modular but do not create separately deployed microservices.

Preferred logical modules:

Bot.Diagnostics  
Simulation.Scenarios  
Simulation.Telemetry  
Diagnostics.Metrics  
Diagnostics.Rules  
Diagnostics.Reporting

Follow the repository's existing language, testing, dependency injection, and naming conventions.

Apply these constraints:

- No LLM integration.
- No machine learning.
- No database unless the existing simulation architecture already requires one.
- Use files as the initial artifact store.
- Do not build a dashboard.
- Do not implement autonomous code changes.
- Do not implement GitHub issue creation.
- Avoid framework-heavy abstractions.
- Every diagnostic conclusion must reference structured evidence.
- Simulation-specific code must not leak into normal bot domain logic.
- Existing simulation tests must remain green.

## Deliverables

Complete the implementation and provide:

- A summary of the architecture added.
- A list of files created and modified.
- The diagnostic rules implemented.
- The metric definitions.
- Commands to run:
  - unit tests,
  - the private-server scenario,
  - report generation.
- The path to a sample JSON report.
- The path to a sample Markdown report.
- Any limitations or unsupported private-server behavior.
- Recommended next vertical slice.

Do not stop after creating interfaces or scaffolding.

The task is complete only when the private simulation runs the scenario and produces tested diagnostic findings and reports.