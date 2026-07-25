import { afterEach, describe, expect, test } from "vitest";

import {
  readConfig,
  screepsRequest,
  uploadModules
} from "../../scripts/screeps-api.mjs";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Screeps API script config", () => {
  test("uses the official Screeps host when SCREEPS_HOST is unset or blank", () => {
    process.env.SCREEPS_TOKEN = "token";
    delete process.env.SCREEPS_HOST;

    expect(readConfig().host).toBe("https://screeps.com");

    process.env.SCREEPS_HOST = "";
    expect(readConfig().host).toBe("https://screeps.com");

    process.env.SCREEPS_HOST = "   ";
    expect(readConfig().host).toBe("https://screeps.com");
  });

  test("normalizes an explicit host by trimming whitespace and trailing slash", () => {
    process.env.SCREEPS_TOKEN = "token";
    process.env.SCREEPS_HOST = " https://screeps.com/ ";

    expect(readConfig().host).toBe("https://screeps.com");
  });

  test("reports non-json API responses without leaking response text", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("<!DOCTYPE html><html>not api json</html>", { status: 404 });

    try {
      await expect(
        screepsRequest({ token: "token", host: "https://screeps.example" }, "/api/user/code/active")
      ).rejects.toThrow(/Malformed Screeps API response \(404\): expected JSON\./);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("accepts successful upload responses that omit legacy ok fields", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ timestamp: 1 }), { status: 200 });

    try {
      await expect(
        uploadModules({ token: "token", host: "https://screeps.example" }, "agentic", {
          main: "module.exports.loop = () => {};"
        })
      ).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
