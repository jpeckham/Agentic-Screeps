import { describe, expect, test, vi } from "vitest";
import { gzipSync } from "node:zlib";

import { LocalScreepsClient } from "../../src/private-testing/local-client.js";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("private local Screeps client", () => {
  test("authenticates with local credentials and uploads modules with the returned token", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { token: "local-token" }))
      .mockResolvedValueOnce(jsonResponse(200, { list: [{ branch: "default" }] }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    const client = new LocalScreepsClient({
      endpoint: "http://127.0.0.1:21025",
      username: "agentic-bot",
      password: "local-password",
      fetch: fetchImpl
    });

    await client.uploadModules("private-combat", { main: "code" });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:21025/api/auth/signin",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "agentic-bot", password: "local-password" })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:21025/api/user/branches",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Token": "local-token" })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:21025/api/user/clone-branch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Token": "local-token" }),
        body: JSON.stringify({ newName: "private-combat", defaultModules: { main: "" } })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:21025/api/user/code",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Token": "local-token" }),
        body: JSON.stringify({ branch: "private-combat", modules: { main: "code" } })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      5,
      "http://127.0.0.1:21025/api/user/set-active-branch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Token": "local-token" }),
        body: JSON.stringify({ branch: "private-combat", activeName: "activeWorld" })
      })
    );
  });

  test("does not clone an existing upload branch", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { token: "local-token" }))
      .mockResolvedValueOnce(jsonResponse(200, { list: [{ branch: "private-combat" }] }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    const client = new LocalScreepsClient({
      endpoint: "http://127.0.0.1:21025",
      username: "agentic-bot",
      password: "local-password",
      fetch: fetchImpl
    });

    await client.uploadModules("private-combat", { main: "code" });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:21025/api/user/code",
      expect.objectContaining({
        body: JSON.stringify({ branch: "private-combat", modules: { main: "code" } })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:21025/api/user/set-active-branch",
      expect.objectContaining({
        body: JSON.stringify({ branch: "private-combat", activeName: "activeWorld" })
      })
    );
  });

  test("reads module maps and rejects malformed authentication responses", async () => {
    const client = new LocalScreepsClient({
      endpoint: "http://127.0.0.1:21025",
      username: "agentic-bot",
      password: "local-password",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(200, { token: "local-token" }))
        .mockResolvedValueOnce(jsonResponse(200, { modules: { main: "code" } }))
    });

    await expect(client.readModules("private-combat")).resolves.toEqual({ main: "code" });

    const malformed = new LocalScreepsClient({
      endpoint: "http://127.0.0.1:21025",
      username: "agentic-bot",
      password: "local-password",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { ok: 1 }))
    });

    await expect(malformed.readModules("private-combat")).rejects.toThrow(/token/);
  });

  test("reads Memory through the authenticated private API", async () => {
    const gzippedTesting = `gz:${gzipSync(JSON.stringify({ testing: { tick: 12 } })).toString("base64")}`;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { token: "local-token" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { testing: { tick: 10 } } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: "{\"testing\":{\"tick\":11}}" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: gzippedTesting }));
    const client = new LocalScreepsClient({
      endpoint: "http://127.0.0.1:21025",
      username: "agentic-bot",
      password: "local-password",
      fetch: fetchImpl
    });

    await expect(client.readMemory()).resolves.toEqual({ testing: { tick: 10 } });
    await expect(client.readMemory("testing")).resolves.toEqual({ testing: { tick: 11 } });
    await expect(client.readMemory("testing")).resolves.toEqual({ testing: { tick: 12 } });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:21025/api/user/memory",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Token": "local-token" })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:21025/api/user/memory?path=testing",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Token": "local-token" })
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:21025/api/user/memory?path=testing",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Token": "local-token" })
      })
    );
  });
});
