export interface PrivateTestingConfig {
  protocol: "http" | "https";
  host: string;
  port: number;
  cliPort: number;
  endpoint: string;
  username: string;
  password: string;
  branch: string;
  dataDir: string;
  preserveWorld: boolean;
}

export interface PrivateTestingConfigOptions {
  destructive?: boolean;
}

type Env = Record<string, string | undefined>;

const OFFICIAL_SCREEPS_HOSTS = new Set([
  "screeps.com",
  "www.screeps.com",
  "screeps-world.com",
  "screepsarena.com"
]);

export function createPrivateTestingConfig(
  env: Env = process.env,
  options: PrivateTestingConfigOptions = {}
): PrivateTestingConfig {
  if (env.SCREEPS_TARGET !== "private") {
    throw new Error("Private testing commands require SCREEPS_TARGET=private.");
  }
  if (options.destructive && env.SCREEPS_PRIVATE_TESTING !== "true") {
    throw new Error("Destructive private testing commands require SCREEPS_PRIVATE_TESTING=true.");
  }

  const protocol = parseProtocol(env.SCREEPS_PRIVATE_PROTOCOL ?? "http");
  const host = normalizeHost(env.SCREEPS_PRIVATE_HOST ?? "127.0.0.1");
  const port = parsePort(env.SCREEPS_PRIVATE_PORT, 21025, "SCREEPS_PRIVATE_PORT");
  const cliPort = parsePort(env.SCREEPS_PRIVATE_CLI_PORT, 21026, "SCREEPS_PRIVATE_CLI_PORT");

  if (isOfficialScreepsEndpoint(`${protocol}://${host}:${port}`)) {
    throw new Error("Private testing refuses to target an official Screeps endpoint.");
  }

  return {
    protocol,
    host,
    port,
    cliPort,
    endpoint: `${protocol}://${host}:${port}`,
    username: env.SCREEPS_PRIVATE_USERNAME?.trim() || "agentic-bot",
    password: env.SCREEPS_PRIVATE_PASSWORD ?? "agentic-local-password",
    branch: env.SCREEPS_PRIVATE_BRANCH?.trim() || "private-combat",
    dataDir: env.SCREEPS_PRIVATE_DATA_DIR?.trim() || ".screeps-private",
    preserveWorld: env.SCREEPS_PRIVATE_PRESERVE_WORLD === "true"
  };
}

export function isOfficialScreepsEndpoint(endpoint: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    parsed = new URL(`https://${endpoint}`);
  }

  const host = parsed.hostname.toLowerCase();
  return OFFICIAL_SCREEPS_HOSTS.has(host);
}

function parseProtocol(value: string): "http" | "https" {
  const normalized = value.replace(/:$/, "").toLowerCase();
  if (normalized === "http" || normalized === "https") return normalized;
  throw new Error(`Unsupported SCREEPS_PRIVATE_PROTOCOL "${value}".`);
}

function normalizeHost(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("SCREEPS_PRIVATE_HOST cannot be empty.");
  return trimmed;
}

function parsePort(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }
  return parsed;
}
