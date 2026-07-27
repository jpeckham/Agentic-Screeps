import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

import { loadProjectEnvironment } from "./private-screeps.mjs";

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const scenarioArgs = args.filter((arg) => !arg.startsWith("--"));
const scenarioName = scenarioArgs[0] || "no-hostile-baseline";
const all = args.includes("--all");
const verbose = args.includes("--verbose");
const outputDir = "test-results/private-scenarios";
const definitionsDir = "test/scenarios/definitions";

try {
  const env = await loadProjectEnvironment();
  const scenarios = await loadScenarios(definitionsDir);
  const selected = all ? scenarios : scenarios.filter((scenario) => scenario.name === scenarioName);
  if (selected.length === 0) throw new Error(`Unknown private scenario "${scenarioName}".`);

  let exitCode = 0;
  for (const scenario of selected) {
    const status = await readStatus(env);
    let result;
    if (!status.running) {
      result = await writeStoppedReport(scenario, status);
    } else {
      const setup = await setupScenarioWorld(scenario, env);
      result = setup.ok
        ? await collectAndWriteScenarioReport(scenario, status, env)
        : await writeSetupFailureReport(scenario, status, setup.error);
    }
    if (result.passed && scenario.diagnostics?.type === "critical-hauler-loss") {
      await runNodeScript(["scripts/generate-critical-hauler-loss-diagnostic.mjs", scenario.name], env);
    }
    process.stdout.write(await readFile(result.textPath, "utf8"));
    if (!result.passed) exitCode = 1;
  }
  process.exitCode = exitCode;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}

async function loadScenarios(directory) {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const scenarios = [];
  for (const file of files) {
    scenarios.push(JSON.parse(await readFile(join(directory, file), "utf8")));
  }
  return scenarios.sort((left, right) => left.name.localeCompare(right.name));
}

async function readStatus(env) {
  try {
    const result = await execFileAsync(process.execPath, ["scripts/private-screeps.mjs", "status"], {
      cwd: process.cwd(),
      env
    });
    return JSON.parse(result.stdout);
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string" && error.stdout.trim()) {
      return JSON.parse(error.stdout);
    }
    throw error;
  }
}

async function setupScenarioWorld(scenario, env) {
  try {
    await runNodeScript(["scripts/private-screeps-world.mjs", "reset"], env);
    await runNodeScript(["scripts/private-screeps-world.mjs", "seed"], env);
    await waitForPostSeedDeployReadiness(env);
    if (scenario.hostileCreeps.length > 0) {
      await runNodeScript(["scripts/private-screeps-world.mjs", "hostiles", scenario.name], env);
    }
    await runNodeScript(["scripts/deploy-local-screeps.mjs"], env);
    const config = readPrivateConfig(env);
    const startedAtTick = (await readStatus(env)).tick ?? 0;
    await createScenarioClient(config).writeMemory(
      {
        privateTestingEnabled: true,
        visualsEnabled: true,
        ...(scenario.diagnostics?.type === "critical-hauler-loss"
          ? {
              diagnostics: {
                scenarioId: "critical-hauler-loss",
                reportScenarioId: scenario.name,
                runId: env.DIAGNOSTIC_RUN_ID || `${scenario.name}-${Date.now()}`,
                startedAtTick,
                roomName: scenario.diagnostics.roomName || config.roomName,
                stableBaselineOffsetTicks: scenario.diagnostics.stableBaselineTick ?? 100,
                haulerLossOffsetTicks: scenario.diagnostics.haulerLossTick ?? 200,
                replacementRequestDelayTicks: scenario.diagnostics.replacementRequestDelayTicks,
                replacementSpawnDelayTicks: scenario.diagnostics.replacementSpawnDelayTicks
              }
            }
          : {})
      },
      "config"
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeError(error) };
  }
}

async function runNodeScript(scriptArgs, env) {
  if (verbose) process.stdout.write(`> node ${scriptArgs.join(" ")}\n`);
  await execFileAsync(process.execPath, scriptArgs, {
    cwd: process.cwd(),
    env
  });
}

async function waitForPostSeedDeployReadiness(env) {
  const delayMs = Number(env.SCREEPS_PRIVATE_POST_SEED_DEPLOY_DELAY_MS || 60_000);
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;
  if (verbose) process.stdout.write(`> wait ${delayMs}ms for private API auth readiness\n`);
  await delay(delayMs);
}

async function writeStoppedReport(scenario, status) {
  return writeReport({
    scenarioName: scenario.name,
    startedAtTick: status.tick ?? 0,
    endedAtTick: status.tick ?? 0,
    results: [
      {
        status: "fail",
        label: "private server is not running",
        message: status.error ?? `private server is unavailable at ${status.endpoint}`
      }
    ]
  });
}

async function writeSetupFailureReport(scenario, status, message) {
  return writeReport({
    scenarioName: scenario.name,
    startedAtTick: status.tick ?? 0,
    endedAtTick: status.tick ?? 0,
    results: [
      {
        status: "fail",
        label: "scenario setup failed",
        message
      }
    ]
  });
}

async function collectAndWriteScenarioReport(scenario, status, env) {
  const config = readPrivateConfig(env);
  const client = createScenarioClient(config);
  const observations = await collectObservations({
    scenario,
    client,
    roomName: config.roomName
  });
  return writeReport({
    scenarioName: scenario.name,
    startedAtTick: observations[0]?.tick ?? status.tick ?? 0,
    endedAtTick: observations.at(-1)?.tick ?? status.tick ?? 0,
    results: evaluateAssertions(scenario.assertions, observations)
  });
}

async function collectObservations({ scenario, client, roomName }) {
  const observations = [];
  const seenTicks = new Set();
  const deadline = Date.now() + Math.max(15_000, (Number(scenario.durationTicks) + 10) * 1500);
  while (Date.now() < deadline) {
    const memory = await client.readMemory();
    const observation = collectObservationFromMemory(memory, roomName);
    if (observation && !seenTicks.has(observation.tick)) {
      seenTicks.add(observation.tick);
      observations.push(observation);
      if (observations.length >= Math.max(1, Number(scenario.durationTicks))) break;
    }
    await delay(1000);
  }
  return observations;
}

function collectObservationFromMemory(memory, roomName) {
  const colony = memory.testing?.colonies?.[roomName];
  if (!memory.testing || !colony) return undefined;
  return {
    tick: memory.testing.tick,
    state: colony,
    runtimeExceptions: collectRuntimeExceptions(memory)
  };
}

function collectRuntimeExceptions(memory) {
  return (memory.runtime?.topLevelFailures ?? [])
    .map((failure) => failure.message ?? failure.error)
    .filter((message) => typeof message === "string" && message.length > 0);
}

function evaluateAssertions(assertions, observations) {
  const ordered = [...observations].sort((left, right) => left.tick - right.tick);
  return assertions.map((assertion) => evaluateAssertion(assertion, ordered));
}

function evaluateAssertion(assertion, observations) {
  switch (assertion.type) {
    case "equals":
      return evaluateEquals(assertion, observations);
    case "oneOf":
      return evaluateOneOf(assertion, observations);
    case "everEquals":
      return evaluateEverEquals(assertion, observations);
    case "everOneOf":
      return evaluateEverOneOf(assertion, observations);
    case "becomesTrueWithin":
      return evaluateBecomesTrueWithin(assertion, observations);
    case "remainsUnchanged":
      return evaluateRemainsUnchanged(assertion, observations);
    case "exists":
      return evaluateExists(assertion, observations, true);
    case "notExists":
      return evaluateExists(assertion, observations, false);
    case "hitPointsDecreased":
      return evaluateHitPointsDecreased(assertion, observations);
    case "postureTransition":
      return evaluatePostureTransition(assertion, observations);
    case "noRuntimeException":
      return evaluateNoRuntimeException(assertion, observations);
    default:
      return fail(assertion.label ?? assertion.type, `unsupported assertion type ${assertion.type}`);
  }
}

function evaluateEquals(assertion, observations) {
  const observed = lastDefined(assertion.path, observations);
  if (Object.is(observed?.value, assertion.expected)) return pass(assertion.label, observed?.tick);
  return fail(assertion.label, `expected ${String(assertion.expected)}, actual ${String(observed?.value)}`, {
    expected: assertion.expected,
    actual: observed?.value,
    ...observedTick(observed?.tick)
  });
}

function evaluateOneOf(assertion, observations) {
  const observed = lastDefined(assertion.path, observations);
  if (assertion.expected.some((expected) => Object.is(expected, observed?.value))) {
    return pass(assertion.label, observed?.tick);
  }
  return fail(assertion.label, `expected one of ${assertion.expected.join(", ")}, actual ${String(observed?.value)}`, {
    expected: assertion.expected,
    actual: observed?.value,
    ...observedTick(observed?.tick)
  });
}

function evaluateEverEquals(assertion, observations) {
  const observed = observations
    .map((observation) => ({ tick: observation.tick, value: getPath(observation.state, assertion.path) }))
    .find((item) => Object.is(item.value, assertion.expected));
  if (observed) return pass(assertion.label, observed.tick);
  const latest = lastDefined(assertion.path, observations);
  return fail(assertion.label, `expected ${String(assertion.expected)}, actual ${String(latest?.value)}`, {
    expected: assertion.expected,
    actual: latest?.value,
    ...observedTick(latest?.tick)
  });
}

function evaluateEverOneOf(assertion, observations) {
  const observed = observations
    .map((observation) => ({ tick: observation.tick, value: getPath(observation.state, assertion.path) }))
    .find((item) => assertion.expected.some((expected) => Object.is(expected, item.value)));
  if (observed) return pass(assertion.label, observed.tick);
  const latest = lastDefined(assertion.path, observations);
  return fail(assertion.label, `expected one of ${assertion.expected.join(", ")}, actual ${String(latest?.value)}`, {
    expected: assertion.expected,
    actual: latest?.value,
    ...observedTick(latest?.tick)
  });
}

function evaluateBecomesTrueWithin(assertion, observations) {
  const window = observationsWithin(assertion.ticks, observations);
  const observed = window.find((observation) => getPath(observation.state, assertion.path) === true);
  if (observed) return pass(assertion.label, observed.tick);
  return fail(assertion.label, `expected ${assertion.path} to become true within ${assertion.ticks} ticks`);
}

function evaluateRemainsUnchanged(assertion, observations) {
  const window = latestObservationsWithin(assertion.ticks, observations).filter(
    (observation) => getPath(observation.state, assertion.path) !== undefined
  );
  const baseline = window[0];
  if (!baseline) return fail(assertion.label, `expected ${assertion.path} to be observed`);
  const expected = getPath(baseline.state, assertion.path);
  const changed = window.find((observation) => !Object.is(getPath(observation.state, assertion.path), expected));
  if (!changed) return pass(assertion.label, baseline.tick);
  return fail(assertion.label, `expected ${String(expected)}, actual ${String(getPath(changed.state, assertion.path))}`, {
    expected,
    actual: getPath(changed.state, assertion.path),
    observedTick: changed.tick
  });
}

function evaluateExists(assertion, observations, shouldExist) {
  const observed = firstDefined(assertion.path, observations);
  const exists = observed?.value !== undefined && observed.value !== null;
  if (exists === shouldExist) return pass(assertion.label, observed?.tick);
  return fail(assertion.label, shouldExist ? `expected ${assertion.path} to exist` : `expected ${assertion.path} not to exist`, {
    actual: observed?.value,
    ...observedTick(observed?.tick)
  });
}

function evaluateHitPointsDecreased(assertion, observations) {
  const values = observations
    .map((observation) => ({ tick: observation.tick, value: getPath(observation.state, assertion.path) }))
    .filter((item) => typeof item.value === "number");
  const first = values[0];
  const decreased = first ? values.find((item) => item.tick > first.tick && item.value < first.value) : undefined;
  if (decreased) return pass(assertion.label, decreased.tick);
  const defeated = first
    ? observations.find((observation) => observation.tick > first.tick && getPath(observation.state, assertion.path) === undefined)
    : undefined;
  if (defeated) return pass(assertion.label, defeated.tick);
  return fail(assertion.label, `expected ${assertion.path} to decrease`);
}

function evaluatePostureTransition(assertion, observations) {
  const fromObservation = observations.find((observation) => getPath(observation.state, assertion.path) === assertion.from);
  const toObservation = fromObservation
    ? observations.find(
        (observation) =>
          observation.tick >= fromObservation.tick &&
          observation.tick - fromObservation.tick <= assertion.withinTicks &&
          getPath(observation.state, assertion.path) === assertion.to
      )
    : undefined;
  if (toObservation) return pass(assertion.label, toObservation.tick);
  return fail(assertion.label, `expected ${assertion.from} to transition to ${assertion.to} within ${assertion.withinTicks} ticks`, {
    expected: assertion.to,
    actual: fromObservation ? getPath(fromObservation.state, assertion.path) : undefined,
    ...observedTick(fromObservation?.tick)
  });
}

function evaluateNoRuntimeException(assertion, observations) {
  const failed = observations.find((observation) => observation.runtimeExceptions.length > 0);
  if (!failed) return pass(assertion.label);
  return fail(assertion.label, `runtime exception: ${failed.runtimeExceptions[0]}`, {
    actual: failed.runtimeExceptions,
    observedTick: failed.tick
  });
}

function pass(label, observedTick) {
  return observedTick === undefined ? { status: "pass", label } : { status: "pass", label, observedTick };
}

function fail(label, message, details = {}) {
  return { status: "fail", label, message, ...details };
}

function firstDefined(path, observations) {
  for (const observation of observations) {
    const value = getPath(observation.state, path);
    if (value !== undefined) return { tick: observation.tick, value };
  }
  return undefined;
}

function lastDefined(path, observations) {
  return firstDefined(path, [...observations].reverse());
}

function observationsWithin(ticks, observations) {
  const start = observations[0]?.tick;
  if (start === undefined) return [];
  return observations.filter((observation) => observation.tick - start <= ticks);
}

function latestObservationsWithin(ticks, observations) {
  const end = observations.at(-1)?.tick;
  if (end === undefined) return [];
  return observations.filter((observation) => end - observation.tick < ticks);
}

function observedTick(tick) {
  return tick === undefined ? {} : { observedTick: tick };
}

function getPath(value, path) {
  return path.split(".").reduce((current, segment) => {
    if (typeof current !== "object" || current === null) return undefined;
    return current[segment];
  }, value);
}

function readPrivateConfig(env) {
  const protocol = (env.SCREEPS_PRIVATE_PROTOCOL || "http").replace(/:$/, "");
  const host = (env.SCREEPS_PRIVATE_HOST || "127.0.0.1").trim().replace(/\/+$/, "");
  const port = Number(env.SCREEPS_PRIVATE_PORT || 21025);
  return {
    endpoint: `${protocol}://${host}:${port}`,
    username: env.SCREEPS_PRIVATE_USERNAME || "agentic-bot",
    password: env.SCREEPS_PRIVATE_PASSWORD || "agentic-local-password",
    roomName: env.SCREEPS_PRIVATE_ROOM || "W1N1"
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
    },
    async writeMemory(value, path) {
      await request(config, await getToken(), "/api/user/memory", {
        method: "POST",
        body: JSON.stringify(path ? { path, value } : { value })
      });
    }
  };

  async function getToken() {
    if (token) return token;
    token = await authenticate(config);
    return token;
  }
}

async function request(config, token, path, init = {}) {
  const attempts = 60;
  let activeToken = token;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${config.endpoint}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "X-Token": activeToken,
        ...init.headers
      }
    });
    const text = await response.text();
    if (response.status === 401 && attempt < attempts) {
      activeToken = await authenticate(config);
      await delay(1000);
      continue;
    }
    const body = parseJson(text);
    if (!response.ok) throw new Error(`Private Screeps API request failed (${response.status}) at ${path}.`);
    if (typeof body.error === "string") throw new Error(`Private Screeps API error: ${redact(body.error)}`);
    return body;
  }
  throw new Error(`Private Screeps API request failed after retry at ${path}.`);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeReport(report) {
  await mkdir(outputDir, { recursive: true });
  const safeName = report.scenarioName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const textPath = join(outputDir, `${safeName}.txt`);
  const jsonPath = join(outputDir, `${safeName}.json`);
  const failureCount = report.results.filter((result) => result.status === "fail").length;
  const passed = failureCount === 0;
  const lines = [
    `${passed ? "PASS" : "FAIL"} ${report.scenarioName}`,
    `  ticks ${report.startedAtTick}..${report.endedAtTick}`
  ];
  for (const result of report.results) {
    lines.push(`  ${result.status.toUpperCase()} ${result.label}`);
    if (result.message) lines.push(`       ${result.message}`);
  }
  await writeFile(textPath, `${lines.join("\n")}\n`, "utf8");
  await writeFile(jsonPath, `${JSON.stringify({ ...report, passed, failureCount }, null, 2)}\n`, "utf8");
  return { passed, failureCount, textPath, jsonPath };
}

function sanitizeError(error) {
  if (error && typeof error === "object") {
    const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    const message = error instanceof Error ? error.message : String(error);
    return redact([stderr, stdout, message].filter(Boolean).join("\n"));
  }
  return redact(String(error));
}

function redact(message) {
  return message.replace(/[A-Za-z0-9_-]{16,}/g, "[redacted]");
}
