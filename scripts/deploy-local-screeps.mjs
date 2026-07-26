import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { loadProjectEnvironment } from "./private-screeps.mjs";

const execFileAsync = promisify(execFile);

const officialHosts = new Set([
  "screeps.com",
  "www.screeps.com",
  "screeps-world.com",
  "screepsarena.com"
]);

async function deployLocalBotFromManifest(path, env) {
  const config = readPrivateDeployConfig(env);
  const manifest = JSON.parse(await readFile(path, "utf8"));
  const modules = {};
  for (const module of manifest.modules) {
    modules[module.name] = await readFile(join(dirname(path), module.file), "utf8");
  }
  if (!(manifest.entryModule in modules)) {
    throw new Error(`Private deployment refused: entry module "${manifest.entryModule}" missing.`);
  }

  const client = new PrivateDeployClient(config);
  await client.uploadModules(config.branch, modules);
  const uploaded = await client.readModules(config.branch);
  verifyUploadedModules({ uploaded, modules, manifest });

  return {
    endpoint: config.endpoint,
    branch: config.branch,
    moduleCount: Object.keys(modules).length,
    entryModule: manifest.entryModule,
    releaseId: manifest.releaseId
  };
}

function readPrivateDeployConfig(env) {
  if (env.SCREEPS_TARGET !== "private") {
    throw new Error("Private local deployment requires SCREEPS_TARGET=private.");
  }
  if (env.SCREEPS_PRIVATE_TESTING !== "true") {
    throw new Error("Private local deployment requires SCREEPS_PRIVATE_TESTING=true.");
  }
  const protocol = (env.SCREEPS_PRIVATE_PROTOCOL || "http").replace(/:$/, "");
  const host = (env.SCREEPS_PRIVATE_HOST || "127.0.0.1").trim().replace(/\/+$/, "");
  const port = Number(env.SCREEPS_PRIVATE_PORT || 21025);
  const endpoint = `${protocol}://${host}:${port}`;
  if (isOfficialEndpoint(endpoint)) {
    throw new Error("Private local deployment refuses to target an official Screeps endpoint.");
  }
  return {
    endpoint,
    username: env.SCREEPS_PRIVATE_USERNAME || "agentic-bot",
    password: env.SCREEPS_PRIVATE_PASSWORD || "agentic-local-password",
    branch: env.SCREEPS_PRIVATE_BRANCH || "private-combat"
  };
}

class PrivateDeployClient {
  token;

  constructor(config) {
    this.config = config;
  }

  async uploadModules(branch, modules) {
    await this.ensureBranch(branch);
    await this.request("/api/user/code", {
      method: "POST",
      body: JSON.stringify({ branch, modules })
    });
    await this.activateWorldBranch(branch);
  }

  async readModules(branch) {
    const body = await this.request(`/api/user/code?branch=${encodeURIComponent(branch)}`);
    const modules = body.modules ?? body;
    if (!isStringRecord(modules)) {
      throw new Error("Private Screeps code response was malformed.");
    }
    return modules;
  }

  async ensureBranch(branch) {
    const body = await this.request("/api/user/branches");
    const branches = body.list ?? body.branches;
    if (!Array.isArray(branches)) {
      throw new Error("Private Screeps branch list response was malformed.");
    }
    if (branches.some((item) => isRecord(item) && item.branch === branch)) return;
    await this.request("/api/user/clone-branch", {
      method: "POST",
      body: JSON.stringify({ newName: branch, defaultModules: { main: "" } })
    });
  }

  async activateWorldBranch(branch) {
    await this.request("/api/user/set-active-branch", {
      method: "POST",
      body: JSON.stringify({ branch, activeName: "activeWorld" })
    });
  }

  async request(path, init = {}) {
    const token = await this.getToken();
    let response;
    try {
      response = await fetch(`${this.config.endpoint}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "X-Token": token,
          ...init.headers
        }
      });
    } catch {
      throw new Error(`Private Screeps server is unavailable at ${this.config.endpoint}.`);
    }
    const body = parseJson(await response.text());
    if (!response.ok) throw new Error(`Private Screeps API request failed (${response.status}).`);
    if (typeof body.error === "string") throw new Error(`Private Screeps API error: ${sanitize(body.error)}`);
    return body;
  }

  async getToken() {
    if (this.token) return this.token;
    let response;
    try {
      response = await fetch(`${this.config.endpoint}/api/auth/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: this.config.username,
          password: this.config.password
        })
      });
    } catch {
      throw new Error(`Private Screeps server is unavailable at ${this.config.endpoint}.`);
    }
    const body = parseJson(await response.text());
    if (!response.ok) throw new Error("Private Screeps authentication failed.");
    const token = body.token ?? body.accessToken;
    if (typeof token !== "string" || !token) {
      throw new Error("Private Screeps authentication response did not include a token.");
    }
    this.token = token;
    return token;
  }
}

function verifyUploadedModules({ uploaded, modules, manifest }) {
  const uploadedNames = Object.keys(uploaded).sort();
  const expectedNames = Object.keys(modules).sort();
  if (JSON.stringify(uploadedNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Private deployment verification failed: module list mismatch. Uploaded ${JSON.stringify(uploadedNames)}.`);
  }
  if (!(manifest.entryModule in uploaded)) {
    throw new Error("Private deployment verification failed: entry module missing.");
  }
  if (!Object.values(uploaded).some((contents) => contents.includes(manifest.releaseId))) {
    throw new Error("Private deployment verification failed: release identifier missing.");
  }
  for (const [name, contents] of Object.entries(modules)) {
    if (uploaded[name] !== contents) {
      throw new Error(`Private deployment verification failed: module "${name}" mismatch.`);
    }
  }
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Private Screeps API response was not JSON.");
  }
}

function isStringRecord(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function sanitize(value) {
  return value.replace(/[A-Za-z0-9_-]{12,}/g, "[redacted]");
}

async function main() {
  const build = await execFileAsync(process.execPath, ["scripts/build-release.mjs"], {
    cwd: process.cwd()
  });
  if (build.stdout) process.stdout.write(build.stdout);
  if (build.stderr) process.stderr.write(build.stderr);

  const manifestPath = process.argv[2] ?? "dist/release-manifest.json";
  const env = await loadProjectEnvironment();
  const result = await deployLocalBotFromManifest(manifestPath, env);

  console.log(`✓ Uploaded ${result.moduleCount} module(s) to ${result.endpoint}`);
  console.log(`✓ Private branch verified: ${result.branch}`);
  console.log(`Release: ${result.releaseId}`);
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(sanitize(message));
  process.exitCode = 1;
});
