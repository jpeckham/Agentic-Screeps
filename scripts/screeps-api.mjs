export function readConfig() {
  const token = process.env.SCREEPS_TOKEN;
  if (!token) throw new Error("SCREEPS_TOKEN is required.");
  const host = process.env.SCREEPS_HOST?.trim() || "https://screeps.com";
  return {
    token,
    host: host.replace(/\/$/, ""),
    shard: process.env.SCREEPS_SHARD
  };
}

export async function screepsRequest(config, path, init = {}) {
  const url = `${config.host}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        "X-Token": config.token,
        ...init.headers
      }
    });
  } catch (error) {
    throw new Error(
      `Screeps network failure while requesting ${url}: ${sanitizeNetworkError(error)}`
    );
  }
  const text = await response.text();
  const body = parseJson(text, response.status);
  if (!response.ok) {
    throw new Error(classify(response.status));
  }
  if (hasApiError(body)) {
    throw new Error(`Screeps API error: ${sanitizeApiError(body.error)}`);
  }
  return body;
}

function sanitizeNetworkError(error) {
  if (error instanceof Error) return error.message.replace(/[A-Za-z0-9_-]{16,}/g, "[redacted]");
  return String(error).replace(/[A-Za-z0-9_-]{16,}/g, "[redacted]");
}

function parseJson(text, status) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Malformed Screeps API response (${status}): expected JSON.`);
  }
}

function hasApiError(value) {
  return value !== null && typeof value === "object" && typeof value.error === "string";
}

function sanitizeApiError(value) {
  return value.replace(/[A-Za-z0-9_-]{16,}/g, "[redacted]");
}

export async function uploadModules(config, branch, modules) {
  await screepsRequest(config, "/api/user/code", {
    method: "POST",
    body: JSON.stringify({ branch, modules })
  });
}

export async function readModules(config, branch) {
  const body = await screepsRequest(
    config,
    `/api/user/code?branch=${encodeURIComponent(branch)}`
  );
  const modules = body.modules ?? body;
  if (!isStringRecord(modules)) {
    throw new Error("Malformed code response.");
  }
  return modules;
}

export async function getActiveBranch(config) {
  const body = await screepsRequest(config, "/api/user/code/active");
  const active = body.activeName ?? body.activeWorld;
  if (typeof active !== "string") throw new Error("Malformed active branch response.");
  return active;
}

export async function activateBranch(config, branch) {
  const body = await screepsRequest(config, "/api/user/code/active", {
    method: "POST",
    body: JSON.stringify({ branch })
  });
  if (body.ok !== 1 && body.ok !== true) throw new Error("Malformed activation response.");
}

export async function listBranches(config) {
  const body = await screepsRequest(config, "/api/user/code/list");
  const branches = body.list ?? body.branches;
  if (!Array.isArray(branches)) throw new Error("Malformed branch list response.");
  return branches;
}

function classify(status) {
  if (status === 401) return "Screeps authentication failure.";
  if (status === 403) return "Screeps permission failure.";
  if (status === 429) return "Screeps rate limit exceeded.";
  if (status >= 500) return "Screeps server error.";
  return `Screeps API request failed (${status}).`;
}

function isStringRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.values(value).every((item) => typeof item === "string")
  );
}
