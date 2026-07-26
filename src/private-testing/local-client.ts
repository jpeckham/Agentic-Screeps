import { gunzipSync } from "node:zlib";

export interface LocalScreepsClientOptions {
  endpoint: string;
  username: string;
  password: string;
  fetch?: typeof fetch;
}

export class LocalScreepsClient {
  private readonly fetchImpl: typeof fetch;
  private token: string | undefined;

  constructor(private readonly options: LocalScreepsClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async uploadModules(branch: string, modules: Record<string, string>): Promise<void> {
    await this.ensureBranch(branch);
    await this.request("/api/user/code", {
      method: "POST",
      body: JSON.stringify({ branch, modules })
    });
    await this.activateWorldBranch(branch);
  }

  async readModules(branch: string): Promise<Record<string, string>> {
    const body = await this.request(
      `/api/user/code?branch=${encodeURIComponent(branch)}`
    );
    const modules = body["modules"] ?? body;
    if (!isStringRecord(modules)) {
      throw new Error("Private Screeps code response was malformed.");
    }
    return modules;
  }

  async readMemory(path?: string): Promise<Record<string, unknown>> {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const body = await this.request(`/api/user/memory${query}`);
    const data = body["data"] ?? body;
    if (typeof data === "string") return parseMemoryData(data);
    if (isRecord(data)) return data;
    throw new Error("Private Screeps Memory response was malformed.");
  }

  private async ensureBranch(branch: string): Promise<void> {
    const body = await this.request("/api/user/branches");
    const branches = body["list"] ?? body["branches"];
    if (!Array.isArray(branches)) {
      throw new Error("Private Screeps branch list response was malformed.");
    }
    if (branches.some((item) => isRecord(item) && item["branch"] === branch)) return;
    await this.request("/api/user/clone-branch", {
      method: "POST",
      body: JSON.stringify({ newName: branch, defaultModules: { main: "" } })
    });
  }

  private async activateWorldBranch(branch: string): Promise<void> {
    await this.request("/api/user/set-active-branch", {
      method: "POST",
      body: JSON.stringify({ branch, activeName: "activeWorld" })
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const token = await this.getToken();
    const response = await this.fetchImpl(`${this.options.endpoint}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "X-Token": token,
        ...init.headers
      }
    });
    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      throw new Error(`Private Screeps API request failed (${response.status}).`);
    }
    if (typeof body["error"] === "string") {
      throw new Error(`Private Screeps API error: ${sanitize(body["error"])}`);
    }
    return body;
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const response = await this.fetchImpl(`${this.options.endpoint}/api/auth/signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: this.options.username,
        password: this.options.password
      })
    });
    const body = parseJson(await response.text());
    if (!response.ok) throw new Error("Private Screeps authentication failed.");
    const token = body["token"] ?? body["accessToken"];
    if (typeof token !== "string" || !token) {
      throw new Error("Private Screeps authentication response did not include a token.");
    }
    this.token = token;
    return token;
  }
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const value = text ? JSON.parse(text) : {};
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // handled below
  }
  throw new Error("Private Screeps API response was not JSON.");
}

function parseMemoryData(data: string): Record<string, unknown> {
  if (data.startsWith("gz:")) {
    return parseJson(gunzipSync(Buffer.from(data.slice(3), "base64")).toString("utf8"));
  }
  return parseJson(data);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitize(value: string): string {
  return value.replace(/[A-Za-z0-9_-]{12,}/g, "[redacted]");
}
