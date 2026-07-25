export function readConfig() {
  const token = process.env.SCREEPS_TOKEN;
  if (!token) throw new Error("SCREEPS_TOKEN is required.");
  return {
    token,
    host: (process.env.SCREEPS_HOST ?? "https://screeps.com").replace(/\/$/, ""),
    shard: process.env.SCREEPS_SHARD
  };
}

export async function screepsRequest(config, path, init = {}) {
  let response;
  try {
    response = await fetch(`${config.host}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "X-Token": config.token,
        ...init.headers
      }
    });
  } catch {
    throw new Error("Screeps network failure.");
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(classify(response.status));
  }
  return body;
}

export async function uploadModules(config, branch, modules) {
  const body = await screepsRequest(config, "/api/user/code", {
    method: "POST",
    body: JSON.stringify({ branch, modules })
  });
  if (body.ok !== 1 && body.ok !== true) throw new Error("Malformed upload response.");
}

export async function readModules(config, branch) {
  const body = await screepsRequest(
    config,
    `/api/user/code?branch=${encodeURIComponent(branch)}`
  );
  if (!body.modules || typeof body.modules !== "object") {
    throw new Error("Malformed code response.");
  }
  return body.modules;
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
