import { execFile as execFileCallback } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCallback);
const composeFile = "infrastructure/private-server/docker-compose.yml";
const officialHosts = new Set([
  "screeps.com",
  "www.screeps.com",
  "screeps-world.com",
  "screepsarena.com"
]);

export function readPrivateServerConfig(env = process.env) {
  const protocol = normalizeProtocol(env.SCREEPS_PRIVATE_PROTOCOL || "http");
  const host = normalizeHost(env.SCREEPS_PRIVATE_HOST || "127.0.0.1");
  const port = parsePort(env.SCREEPS_PRIVATE_PORT, 21025, "SCREEPS_PRIVATE_PORT");
  const cliPort = parsePort(env.SCREEPS_PRIVATE_CLI_PORT, 21026, "SCREEPS_PRIVATE_CLI_PORT");
  const endpoint = `${protocol}://${host}:${port}`;

  if (env.SCREEPS_TARGET !== "private") {
    throw new Error("Private server commands require SCREEPS_TARGET=private.");
  }
  if (env.SCREEPS_PRIVATE_TESTING !== "true") {
    throw new Error("Private server commands require SCREEPS_PRIVATE_TESTING=true.");
  }
  if (isOfficialEndpoint(endpoint)) {
    throw new Error("Private server commands refuse to target an official Screeps endpoint.");
  }

  return {
    protocol,
    host,
    port,
    cliPort,
    endpoint,
    dataDir: env.SCREEPS_PRIVATE_DATA_DIR || ".screeps-private",
    composeProject: env.SCREEPS_PRIVATE_COMPOSE_PROJECT || "agentic-screeps-private",
    startTimeoutMs: parsePositiveInteger(
      env.SCREEPS_PRIVATE_START_TIMEOUT_MS,
      300_000,
      "SCREEPS_PRIVATE_START_TIMEOUT_MS"
    )
  };
}

export function buildComposeArgs(config, command) {
  const base = ["compose", "-p", config.composeProject, "-f", composeFile];
  if (command === "start") return [...base, "up", "-d"];
  if (command === "stop") return [...base, "down"];
  if (command === "logs") return [...base, "logs", "--tail", "200"];
  throw new Error(`Unsupported private server lifecycle command "${command}".`);
}

export async function preparePrivateServerDataDir(config) {
  await mkdir(config.dataDir, { recursive: true });
  const target = join(config.dataDir, "config.yml");
  if (!existsSync(target)) {
    await copyFile("infrastructure/private-server/config/config.sample.yml", target);
  }
}

export async function getPrivateServerStatus({ config, fetchImpl = fetch }) {
  try {
    const versionResponse = await fetchImpl(`${config.endpoint}/api/version`);
    if (!versionResponse.ok) {
      return stoppedStatus(config, `health endpoint returned HTTP ${versionResponse.status}`);
    }
    const versionBody = await parseJsonResponse(versionResponse);
    const tick = await readCurrentTick(config, fetchImpl);
    return {
      running: true,
      endpoint: config.endpoint,
      version: typeof versionBody.version === "string" ? versionBody.version : undefined,
      tick
    };
  } catch (error) {
    return stoppedStatus(config, `unreachable: ${sanitizeError(error)}`);
  }
}

export async function runPrivateServerCommand(args, options = {}) {
  const command = args[0] || "status";
  const env = await loadProjectEnvironment({
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env
  });
  const stdout = options.stdout || ((message) => process.stdout.write(message));
  const stderr = options.stderr || ((message) => process.stderr.write(message));
  const execFile = options.execFile || execFileAsync;
  const fetchImpl = options.fetchImpl || fetch;
  const config = readPrivateServerConfig(env);

  if (command === "status") {
    const status = await getPrivateServerStatus({ config, fetchImpl });
    stdout(`${JSON.stringify(status, null, 2)}\n`);
    return status.running ? 0 : 1;
  }

  if (command === "start" || command === "stop" || command === "logs") {
    if (command === "start") await preparePrivateServerDataDir(config);
    const result = await execFile("docker", buildComposeArgs(config, command), {
      cwd: process.cwd(),
      env: withoutPublicScreepsToken({
        ...process.env,
        ...env,
        SCREEPS_PRIVATE_HOST: config.host,
        SCREEPS_PRIVATE_PORT: String(config.port),
        SCREEPS_PRIVATE_CLI_PORT: String(config.cliPort),
        SCREEPS_PRIVATE_DATA_DIR: config.dataDir
      })
    });
    if (command === "logs") {
      if (result.stdout) stdout(result.stdout);
      if (result.stderr) stderr(result.stderr);
    }
    if (command === "start") {
      const status = await waitForStatus(config, fetchImpl, options.waitTimeoutMs ?? config.startTimeoutMs);
      stdout(`${JSON.stringify(status, null, 2)}\n`);
      return status.running ? 0 : 1;
    }
    return 0;
  }

  stderr(`Unsupported command "${command}". Use start, stop, status, or logs.\n`);
  return 2;
}

function withoutPublicScreepsToken(env) {
  const next = { ...env };
  delete next.SCREEPS_TOKEN;
  return next;
}

export async function loadProjectEnvironment(options = {}) {
  const cwd = options.cwd || process.cwd();
  const explicitEnv = options.env || process.env;
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return { ...explicitEnv };

  const fileEnv = parseDotEnv(await readFile(envPath, "utf8"));
  return {
    ...fileEnv,
    ...explicitEnv
  };
}

function parseDotEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    values[key] = unquoteDotEnvValue(rawValue);
  }
  return values;
}

function unquoteDotEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const commentIndex = trimmed.indexOf(" #");
  return commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
}

async function waitForStatus(config, fetchImpl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let status = await getPrivateServerStatus({ config, fetchImpl });
  while (!status.running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    status = await getPrivateServerStatus({ config, fetchImpl });
  }
  return status;
}

async function readCurrentTick(config, fetchImpl) {
  try {
    const response = await fetchImpl(`${config.endpoint}/api/game/time`);
    if (!response.ok) return undefined;
    const body = await parseJsonResponse(response);
    return Number.isInteger(body.time) ? body.time : undefined;
  } catch {
    return undefined;
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function stoppedStatus(config, error) {
  return {
    running: false,
    endpoint: config.endpoint,
    error
  };
}

function isOfficialEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    parsed = new URL(`https://${endpoint}`);
  }
  return officialHosts.has(parsed.hostname.toLowerCase());
}

function normalizeProtocol(value) {
  const protocol = value.replace(/:$/, "").toLowerCase();
  if (protocol === "http" || protocol === "https") return protocol;
  throw new Error(`Unsupported SCREEPS_PRIVATE_PROTOCOL "${value}".`);
}

function normalizeHost(value) {
  const host = value.trim().replace(/\/+$/, "");
  if (!host) throw new Error("SCREEPS_PRIVATE_HOST cannot be empty.");
  return host;
}

function parsePort(value, fallback, name) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }
  return port;
}

function parsePositiveInteger(value, fallback, name) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z0-9_-]{16,}/g, "[redacted]");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPrivateServerCommand(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(sanitizeError(error));
      process.exitCode = 1;
    }
  );
}
