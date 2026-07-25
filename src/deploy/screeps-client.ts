export interface ScreepsClientOptions {
  token: string;
  host?: string;
  fetch?: typeof fetch;
}

export class ScreepsApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ScreepsApiError";
  }
}

interface ActiveBranchResponse {
  activeName?: unknown;
  activeWorld?: unknown;
}

interface BranchListResponse {
  list?: unknown;
  branches?: unknown;
}

export class ScreepsClient {
  private readonly host: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ScreepsClientOptions) {
    if (!options.token) {
      throw new Error("SCREEPS_TOKEN is required.");
    }
    this.host = (options.host ?? "https://screeps.com").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  async uploadModules(branch: string, modules: Record<string, string>): Promise<void> {
    const body = await this.request<{ ok?: unknown }>("/api/user/code", {
      method: "POST",
      body: JSON.stringify({ branch, modules })
    });
    if (body.ok !== 1 && body.ok !== true) {
      throw new ScreepsApiError("Malformed Screeps upload response.");
    }
  }

  async readModules(branch: string): Promise<Record<string, string>> {
    const body = await this.request<{ modules?: unknown }>(
      `/api/user/code?branch=${encodeURIComponent(branch)}`
    );
    if (!isStringRecord(body.modules)) {
      throw new ScreepsApiError("Malformed Screeps code response.");
    }
    return body.modules;
  }

  async getActiveBranch(): Promise<string> {
    const body = await this.request<ActiveBranchResponse>("/api/user/code/active");
    const active = body.activeName ?? body.activeWorld;
    if (typeof active !== "string") {
      throw new ScreepsApiError("Malformed Screeps active branch response.");
    }
    return active;
  }

  async activateBranch(branch: string): Promise<void> {
    const body = await this.request<{ ok?: unknown }>("/api/user/code/active", {
      method: "POST",
      body: JSON.stringify({ branch })
    });
    if (body.ok !== 1 && body.ok !== true) {
      throw new ScreepsApiError("Malformed Screeps activation response.");
    }
  }

  async listBranches(): Promise<string[]> {
    const body = await this.request<BranchListResponse>("/api/user/code/list");
    const value = body.list ?? body.branches;
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new ScreepsApiError("Malformed Screeps branch list response.");
    }
    return value;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.host}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "X-Token": this.options.token,
          ...init.headers
        }
      });
    } catch {
      throw new ScreepsApiError("Screeps network failure.");
    }

    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      throw new ScreepsApiError(classifyStatus(response.status, body), response.status);
    }
    return body as T;
  }
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ScreepsApiError("Malformed JSON response from Screeps API.");
  }
}

function classifyStatus(status: number, body: unknown): string {
  const detail = typeof body === "object" && body !== null && "error" in body
    ? String((body as { error: unknown }).error)
    : "";
  if (status === 401) return "Screeps authentication failure.";
  if (status === 403) return "Screeps permission failure.";
  if (status === 429) return "Screeps rate limit exceeded.";
  if (status >= 500) return "Screeps server error.";
  return `Screeps API request failed (${status})${detail ? `: ${sanitize(detail)}` : ""}`;
}

function sanitize(value: string): string {
  return value.replace(/[A-Za-z0-9_-]{12,}/g, "[redacted]");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((item) => typeof item === "string")
  );
}
