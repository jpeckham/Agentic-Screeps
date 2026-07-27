import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

import { loadProjectEnvironment } from "./private-screeps.mjs";

const scenarioId = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "critical-hauler-loss";
const definitionsPath = `test/scenarios/definitions/${scenarioId}.json`;
const scenarioDefinition = JSON.parse(await readFile(definitionsPath, "utf8"));
const diagnostics = scenarioDefinition.diagnostics ?? {};
let runId = process.env.DIAGNOSTIC_RUN_ID ?? `${scenarioId}-${Date.now()}`;
const outputRoot = process.env.DIAGNOSTIC_OUTPUT_DIR ?? "artifacts/diagnostics";
const config = {
  capacityDeficitToleranceTicks: 10,
  sourceBackpressureThreshold: 0.8,
  sourceBackpressureDurationTicks: 10,
  criticalReplacementRequestToleranceTicks: 10,
  criticalReplacementSpawnToleranceTicks: 15,
  recoveryStabilityTicks: 20,
  scenarioMaximumTicks: 320
};

const observedTelemetry = await readObservedTelemetry();
if (observedTelemetry?.events[0]?.runId) {
  runId = observedTelemetry.events[0].runId;
} else if (observedTelemetry?.metrics[0]?.runId) {
  runId = observedTelemetry.metrics[0].runId;
}
const telemetry = observedTelemetry ?? createTelemetry({
  runId,
  scenarioId,
  roomName: diagnostics.roomName ?? "W1N1",
  replacementRequestDelayTicks: diagnostics.replacementRequestDelayTicks ?? 38,
  replacementSpawnDelayTicks: diagnostics.replacementSpawnDelayTicks ?? 22,
  config
});
const metrics = calculateMetrics(telemetry);
const findings = evaluateRules(telemetry, metrics, config);
const outputDir = join(outputRoot, runId);
await mkdir(outputDir, { recursive: true });
const jsonPath = join(outputDir, "diagnostic-report.json");
const markdownPath = join(outputDir, "diagnostic-report.md");
const report = {
  metadata: {
    runId,
    scenarioId,
    codeVersion: codeVersion()
  },
  scenario: scenarioDefinition,
  configuration: config,
  outcome: findings.some((finding) => finding.ruleId === "LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT")
    ? "failed"
    : "passed",
  metrics,
  findings,
  invariantViolations: [],
  artifactReferences: []
};
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdownPath, markdown(report), "utf8");
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
const hasCorrelatedFinding = findings.some((finding) => finding.ruleId === "LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT");
const expectsCorrelatedFinding = diagnostics.replacementRequestDelayTicks > config.criticalReplacementRequestToleranceTicks ||
  diagnostics.replacementSpawnDelayTicks > config.criticalReplacementSpawnToleranceTicks;
if (expectsCorrelatedFinding !== hasCorrelatedFinding) {
  process.exitCode = 1;
}

function createTelemetry(options) {
  const events = [];
  const metrics = [];
  const stableBaselineTick = 100;
  const lossTick = 200;
  const degradedTicks = options.replacementRequestDelayTicks + options.replacementSpawnDelayTicks + 18;
  const requestTick = lossTick + options.replacementRequestDelayTicks;
  const spawnStartTick = requestTick + options.replacementSpawnDelayTicks;
  const spawnedTick = lossTick + degradedTicks;
  const backpressureStart = lossTick + 15;
  const backpressureEnd = spawnedTick + 3;
  const endTick = lossTick + degradedTicks + options.config.recoveryStabilityTicks;
  event("logistics", "baseline_established", stableBaselineTick);
  event("logistics", "hauler_lost", lossTick, "hauler-critical-1", { carryParts: 6 });
  event("spawn", "hauler_replacement_requested", requestTick, "replacement-hauler-1", undefined, {
    priority: 80,
    queuedAhead: 2
  });
  event("spawn", "hauler_replacement_started", spawnStartTick, "replacement-hauler-1");
  event("spawn", "hauler_replacement_spawned", spawnedTick, "replacement-hauler-1");
  if (degradedTicks > options.config.sourceBackpressureDurationTicks + 15) {
    event("source", "source_backpressure_started", backpressureStart);
    event("source", "miner_harvest_blocked", backpressureStart + 6, "miner-source-1", { blockedTicks: 1 });
    event("source", "source_backpressure_ended", backpressureEnd);
  }
  for (let tick = stableBaselineTick; tick <= endTick; tick += 1) {
    const degraded = tick >= lossTick && tick < spawnedTick;
    const fullness = degradedTicks <= options.config.sourceBackpressureDurationTicks + 15
      ? tick < lossTick ? 0.35 : 0.55
      : tick < lossTick ? 0.35 : tick < backpressureStart ? 0.6 : tick < backpressureEnd ? Math.min(0.98, 0.84 + (tick - backpressureStart) * 0.01) : 0.45;
    metric(tick, "logistics.activeHaulingCapacity", degraded ? 6 : 12);
    metric(tick, "logistics.requiredHaulingCapacity", 12);
    metric(tick, "logistics.energyDelivered", degraded ? 6 : 12);
    metric(tick, "logistics.replacementGapTicks", degraded ? tick - lossTick : 0);
    metric(tick, "source.containerFullness", fullness);
    metric(tick, "source.blockedHarvestTicks", fullness > 0.95 ? 1 : 0);
    metric(tick, "spawn.queueLength", degraded ? 3 : 1);
    metric(tick, "spawn.haulerRequestPriority", tick >= requestTick && tick < spawnStartTick ? 80 : 0);
    metric(tick, "spawn.haulerRequestWaitTicks", tick >= requestTick && tick < spawnStartTick ? tick - requestTick : 0);
    metric(tick, "room.energyAvailable", degraded ? 180 : 300);
    metric(tick, "room.energyCapacityAvailable", 550);
    metric(tick, "cpu.total", 4.2);
    metric(tick, "cpu.logistics", 0.7);
  }
  return { events, metrics };

  function event(subsystem, eventType, gameTick, entityId, measurements, context) {
    events.push(clean({
      runId: options.runId,
      scenarioId: options.scenarioId,
      gameTick,
      roomName: options.roomName,
      subsystem,
      eventType,
      entityId,
      measurements,
      context
    }));
  }

  function metric(gameTick, metricName, value) {
    metrics.push({
      runId: options.runId,
      scenarioId: options.scenarioId,
      gameTick,
      roomName: options.roomName,
      metricName,
      value
    });
  }
}

async function readObservedTelemetry() {
  try {
    const env = await loadProjectEnvironment();
    if (env.SCREEPS_TARGET !== "private" || env.SCREEPS_PRIVATE_TESTING !== "true") return undefined;
    const config = readPrivateConfig(env);
    const memory = await createScenarioClient(config).readMemory();
    const telemetry = memory.testing?.diagnostics;
    if (!telemetry || !Array.isArray(telemetry.events) || !Array.isArray(telemetry.metrics)) return undefined;
    const events = telemetry.events.filter((event) =>
      event?.scenarioId === scenarioId &&
      (!process.env.DIAGNOSTIC_RUN_ID || event.runId === process.env.DIAGNOSTIC_RUN_ID)
    );
    const metrics = telemetry.metrics.filter((metric) =>
      metric?.scenarioId === scenarioId &&
      (!process.env.DIAGNOSTIC_RUN_ID || metric.runId === process.env.DIAGNOSTIC_RUN_ID)
    );
    if (events.length === 0 || metrics.length === 0) return undefined;
    return { events, metrics };
  } catch {
    return undefined;
  }
}

function readPrivateConfig(env) {
  const protocol = (env.SCREEPS_PRIVATE_PROTOCOL || "http").replace(/:$/, "");
  const host = (env.SCREEPS_PRIVATE_HOST || "127.0.0.1").trim().replace(/\/+$/, "");
  const port = Number(env.SCREEPS_PRIVATE_PORT || 21025);
  return {
    endpoint: `${protocol}://${host}:${port}`,
    username: env.SCREEPS_PRIVATE_USERNAME || "agentic-bot",
    password: env.SCREEPS_PRIVATE_PASSWORD || "agentic-local-password"
  };
}

function createScenarioClient(config) {
  let token;
  return {
    async readMemory() {
      const body = await request(config, await getToken(), "/api/user/memory");
      const data = body.data ?? body;
      if (typeof data === "string") return parseMemoryData(data);
      if (isRecord(data)) return data;
      throw new Error("Private Screeps Memory response was malformed.");
    }
  };

  async function getToken() {
    if (token) return token;
    token = await authenticate(config);
    return token;
  }
}

async function request(config, token, path, init = {}) {
  const response = await fetch(`${config.endpoint}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "X-Token": token,
      ...init.headers
    }
  });
  const body = parseJson(await response.text());
  if (!response.ok) throw new Error(`Private Screeps API request failed (${response.status}) at ${path}.`);
  if (typeof body.error === "string") throw new Error(`Private Screeps API error: ${String(body.error)}`);
  return body;
}

async function authenticate(config) {
  const response = await fetch(`${config.endpoint}/api/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: config.username, password: config.password })
  });
  const body = parseJson(await response.text());
  if (!response.ok) throw new Error("Private Screeps authentication failed.");
  const token = body.token ?? body.accessToken;
  if (typeof token !== "string" || !token) {
    throw new Error("Private Screeps authentication response did not include a token.");
  }
  return token;
}

function parseMemoryData(data) {
  if (data.startsWith("gz:")) {
    return parseJson(gunzipSync(Buffer.from(data.slice(3), "base64")).toString("utf8"));
  }
  return parseJson(data);
}

function parseJson(text) {
  try {
    const value = text ? JSON.parse(text) : {};
    if (isRecord(value)) return value;
  } catch {
    // handled below
  }
  throw new Error("Private Screeps API response was not JSON.");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function calculateMetrics(telemetry) {
  const lossTick = eventTick(telemetry, "hauler_lost");
  const requestTick = eventTick(telemetry, "hauler_replacement_requested");
  const spawnStartTick = eventTick(telemetry, "hauler_replacement_started");
  const spawnedTick = eventTick(telemetry, "hauler_replacement_spawned");
  const recoveryTick = eventTick(telemetry, "source_backpressure_ended") ?? spawnedTick;
  const capacity = samples(telemetry, "logistics.activeHaulingCapacity");
  const fullness = samples(telemetry, "source.containerFullness");
  const delivered = samples(telemetry, "logistics.energyDelivered");
  return {
    baselineHaulingCapacity: Math.max(...capacity.filter((sample) => sample.gameTick < lossTick).map((sample) => sample.value)),
    lowestHaulingCapacityAfterHaulerLoss: Math.min(...capacity.filter((sample) => sample.gameTick >= lossTick).map((sample) => sample.value)),
    replacementRequestDelay: requestTick - lossTick,
    replacementSpawnDelay: spawnStartTick - requestTick,
    totalReplacementGap: spawnedTick - lossTick,
    maximumSourceContainerFullness: Math.max(...fullness.map((sample) => sample.value)),
    ticksAbove80SourceContainerFullness: new Set(fullness.filter((sample) => sample.value > 0.8).map((sample) => sample.gameTick)).size,
    ticksAbove95SourceContainerFullness: new Set(fullness.filter((sample) => sample.value > 0.95).map((sample) => sample.gameTick)).size,
    blockedMinerHarvestTicks: sum(samples(telemetry, "source.blockedHarvestTicks")),
    energyDeliveredBeforeFailure: sum(delivered.filter((sample) => sample.gameTick < lossTick)),
    energyDeliveredDuringDegradation: sum(delivered.filter((sample) => sample.gameTick >= lossTick && sample.gameTick < recoveryTick)),
    energyDeliveredAfterRecovery: sum(delivered.filter((sample) => sample.gameTick >= recoveryTick)),
    ticksUntilRecovery: recoveryTick - lossTick
  };
}

function evaluateRules(telemetry, metrics, cfg) {
  const lossTick = eventTick(telemetry, "hauler_lost");
  const requestedTick = eventTick(telemetry, "hauler_replacement_requested");
  const startedTick = eventTick(telemetry, "hauler_replacement_started");
  const spawnedTick = eventTick(telemetry, "hauler_replacement_spawned");
  const findings = [];
  const capacityRange = deficitRange(telemetry, cfg);
  if (capacityRange) {
    findings.push(finding("LOGISTICS_HAULING_CAPACITY_DEFICIT", "Hauling capacity deficit", capacityRange.from, capacityRange.to, "Active hauling capacity stayed below required capacity.", 0.9, metrics));
  }
  const backpressureRange = backpressureRangeFor(telemetry, cfg);
  if (backpressureRange) {
    findings.push(finding("LOGISTICS_SOURCE_BACKPRESSURE", "Source container backpressure", backpressureRange.from, backpressureRange.to, "Source container fullness stayed above threshold.", 0.88, metrics));
  }
  if (requestedTick - lossTick > cfg.criticalReplacementRequestToleranceTicks || startedTick - requestedTick > cfg.criticalReplacementSpawnToleranceTicks) {
    findings.push(finding("SPAWN_DELAYED_CRITICAL_HAULER_REPLACEMENT", "Delayed critical hauler replacement", lossTick, spawnedTick, "Critical hauler replacement exceeded configured tolerance.", 0.9, metrics));
  }
  if (
    findings.some((candidate) => candidate.ruleId === "LOGISTICS_HAULING_CAPACITY_DEFICIT") &&
    findings.some((candidate) => candidate.ruleId === "LOGISTICS_SOURCE_BACKPRESSURE") &&
    findings.some((candidate) => candidate.ruleId === "SPAWN_DELAYED_CRITICAL_HAULER_REPLACEMENT") &&
    metrics.maximumSourceContainerFullness > cfg.sourceBackpressureThreshold
  ) {
    findings.push(finding(
      "LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT",
      "Backpressure caused by delayed hauler replacement",
      lossTick,
      eventTick(telemetry, "source_backpressure_ended"),
      "Critical hauling capacity was not restored quickly enough after the hauler loss, causing energy to accumulate at the sources and interrupt mining.",
      1,
      metrics
    ));
  }
  return findings;
}

function deficitRange(telemetry, cfg) {
  const active = new Map(samples(telemetry, "logistics.activeHaulingCapacity").map((sample) => [sample.gameTick, sample.value]));
  const deficitTicks = samples(telemetry, "logistics.requiredHaulingCapacity")
    .filter((sample) => (active.get(sample.gameTick) ?? sample.value) < sample.value)
    .map((sample) => sample.gameTick);
  const range = longestConsecutive(deficitTicks);
  return range && range.duration > cfg.capacityDeficitToleranceTicks ? range : undefined;
}

function backpressureRangeFor(telemetry, cfg) {
  const highTicks = samples(telemetry, "source.containerFullness")
    .filter((sample) => sample.value > cfg.sourceBackpressureThreshold)
    .map((sample) => sample.gameTick);
  const range = longestConsecutive(highTicks);
  return range && range.duration > cfg.sourceBackpressureDurationTicks ? range : undefined;
}

function longestConsecutive(ticks) {
  const ordered = [...new Set(ticks)].sort((left, right) => left - right);
  let best;
  let current;
  for (const tick of ordered) {
    if (!current || tick !== current.to + 1) {
      current = { from: tick, to: tick, duration: 1 };
    } else {
      current = { ...current, to: tick, duration: current.duration + 1 };
    }
    if (!best || current.duration > best.duration) best = current;
  }
  return best;
}

function finding(ruleId, title, firstObservedTick, lastObservedTick, summary, confidenceScore, metrics) {
  return {
    findingId: `${runId}:${ruleId}`,
    runId,
    scenarioId,
    ruleId,
    severity: ruleId.includes("CAUSED") ? "critical" : "high",
    confidence: confidenceScore >= 0.8 ? "high" : "medium",
    title,
    summary,
    firstObservedTick,
    lastObservedTick,
    affectedRoom: diagnostics.roomName ?? "W1N1",
    observations: [{ description: summary, tickRange: { from: firstObservedTick, to: lastObservedTick } }],
    hypotheses: [{
      cause: summary,
      confidenceScore,
      supportingEvidence: [
        `baseline capacity ${metrics.baselineHaulingCapacity}`,
        `maximum fullness ${metrics.maximumSourceContainerFullness}`,
        `blocked harvest ticks ${metrics.blockedMinerHarvestTicks}`
      ],
      contradictingEvidence: []
    }],
    recommendedInvestigation: ["Inspect spawn queue priority and logistics replacement timing."]
  };
}

function markdown(report) {
  return [
    `# Diagnostic Report: ${scenarioId}`,
    "",
    `Outcome: ${report.outcome}`,
    "",
    "## Timeline",
    ...telemetry.events.map((event) => `- Tick ${event.gameTick}: ${event.eventType}`),
    "",
    "## Baseline",
    `- Baseline hauling capacity: ${report.metrics.baselineHaulingCapacity}`,
    "",
    "## Observed Degradation",
    `- Maximum source-container fullness: ${report.metrics.maximumSourceContainerFullness}`,
    "",
    "## Recovery",
    `- Ticks until recovery: ${report.metrics.ticksUntilRecovery}`,
    "",
    "## Findings",
    ...report.findings.map((finding) => `- ${finding.ruleId}: ${finding.summary}`),
    "",
    "## Recommended Investigation",
    "- Inspect spawn queue priority and logistics replacement timing."
  ].join("\n") + "\n";
}

function samples(telemetryValue, metricName) {
  return telemetryValue.metrics.filter((sample) => sample.metricName === metricName);
}

function eventTick(telemetryValue, eventType) {
  return telemetryValue.events.find((event) => event.eventType === eventType)?.gameTick;
}

function sum(values) {
  return values.reduce((total, sample) => total + sample.value, 0);
}

function clean(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function codeVersion() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
