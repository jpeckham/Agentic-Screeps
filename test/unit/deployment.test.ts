import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import { buildModulePayload } from "../../src/deploy/artifact.js";
import {
  ScreepsApiError,
  ScreepsClient
} from "../../src/deploy/screeps-client.js";
import {
  deployCandidate,
  deployLive
} from "../../src/deploy/workflows.js";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("deployment artifact payload", () => {
  test("builds module payload from JavaScript files and rejects unsafe contents", async () => {
    const dir = await mkdtemp(join(tmpdir(), "payload-"));
    try {
      await writeFile(join(dir, "main.js"), "module.exports.loop = () => {};");
      await writeFile(join(dir, "helper.js"), "module.exports.help = true;");
      const payload = await buildModulePayload(dir, "main");

      expect(Object.keys(payload.modules)).toEqual(["helper", "main"]);

      await writeFile(join(dir, "fixture.json"), "{}");
      await expect(buildModulePayload(dir, "main")).rejects.toThrow(
        /non-javascript/i
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("Screeps client", () => {
  test("uploads to the requested branch with an X-Token header and never leaks token text", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { ok: 1 }));
    const client = new ScreepsClient({
      token: "super-secret-token",
      host: "https://screeps.example",
      fetch: fetchMock
    });

    await client.uploadModules("release-abc12345", { main: "code" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://screeps.example/api/user/code",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Token": "super-secret-token" }),
        body: JSON.stringify({ branch: "release-abc12345", modules: { main: "code" } })
      })
    );

    const failing = new ScreepsClient({
      token: "super-secret-token",
      host: "https://screeps.example",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(401, { error: "bad super-secret-token" }))
    });

    await expect(failing.getActiveBranch()).rejects.toThrow(ScreepsApiError);
    await failing.getActiveBranch().catch((error: unknown) => {
      expect(String(error)).not.toContain("super-secret-token");
    });
  });

  test("classifies malformed, auth, permission, rate-limit, server, and network failures", async () => {
    const cases: Array<[number, string]> = [
      [401, "authentication"],
      [403, "permission"],
      [429, "rate limit"],
      [500, "server"]
    ];

    for (const [status, message] of cases) {
      const client = new ScreepsClient({
        token: "token",
        host: "https://screeps.example",
        fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(status, { error: message }))
      });
      await expect(client.getActiveBranch()).rejects.toThrow(message);
    }

    const malformed = new ScreepsClient({
      token: "token",
      host: "https://screeps.example",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { ok: 1 }))
    });
    await expect(malformed.getActiveBranch()).rejects.toThrow(/malformed/i);

    const network = new ScreepsClient({
      token: "token",
      host: "https://screeps.example",
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("socket token"))
    });
    await expect(network.getActiveBranch()).rejects.toThrow(/network/i);
  });
});

describe("deployment workflows", () => {
  test("candidate deployment uploads and verifies without activation", async () => {
    const client = {
      uploadModules: vi.fn().mockResolvedValue(undefined),
      getActiveBranch: vi.fn().mockResolvedValue("main"),
      readModules: vi.fn().mockResolvedValue({ main: "release-abc12345 code" }),
      activateBranch: vi.fn()
    };

    await deployCandidate({
      client,
      branch: "release-abc12345",
      modules: { main: "release-abc12345 code" },
      releaseId: "release-abc12345",
      entryModule: "main"
    });

    expect(client.uploadModules).toHaveBeenCalledWith("release-abc12345", {
      main: "release-abc12345 code"
    });
    expect(client.activateBranch).not.toHaveBeenCalled();
  });

  test("live deployment may upload to the active production branch after verification", async () => {
    const client = {
      uploadModules: vi.fn().mockResolvedValue(undefined),
      getActiveBranch: vi.fn().mockResolvedValue("agentic"),
      readModules: vi.fn().mockResolvedValue({ main: "release-abc12345 code" }),
      activateBranch: vi.fn()
    };

    const result = await deployLive({
      client,
      branch: "agentic",
      modules: { main: "release-abc12345 code" },
      releaseId: "release-abc12345",
      entryModule: "main"
    });

    expect(result.activeBranch).toBe("agentic");
    expect(client.uploadModules).toHaveBeenCalledWith("agentic", {
      main: "release-abc12345 code"
    });
    expect(client.activateBranch).not.toHaveBeenCalled();
  });

  test("live deployment verifies expected modules even when the branch has stale extras", async () => {
    const client = {
      uploadModules: vi.fn().mockResolvedValue(undefined),
      getActiveBranch: vi.fn().mockResolvedValue("agentic"),
      readModules: vi.fn().mockResolvedValue({
        main: "release-abc12345 code",
        stale: "old code"
      }),
      activateBranch: vi.fn()
    };

    await expect(
      deployLive({
        client,
        branch: "agentic",
        modules: { main: "release-abc12345 code" },
        releaseId: "release-abc12345",
        entryModule: "main"
      })
    ).resolves.toEqual({ activeBranch: "agentic", deployedBranch: "agentic" });
  });

});
