import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import {
  buildComposeArgs,
  getPrivateServerStatus,
  loadProjectEnvironment,
  preparePrivateServerDataDir,
  readPrivateServerConfig,
  runPrivateServerCommand
} from "../../scripts/private-screeps.mjs";

describe("private server lifecycle script", () => {
  test("reads a localhost-only config and refuses official endpoints", () => {
    const config = readPrivateServerConfig({
      SCREEPS_TARGET: "private",
      SCREEPS_PRIVATE_TESTING: "true",
      SCREEPS_PRIVATE_HOST: "127.0.0.1",
      SCREEPS_PRIVATE_PORT: "21025"
    });

    expect(config.endpoint).toBe("http://127.0.0.1:21025");
    expect(config.composeProject).toBe("agentic-screeps-private");

    expect(() =>
      readPrivateServerConfig({
        SCREEPS_TARGET: "private",
        SCREEPS_PRIVATE_TESTING: "true",
        SCREEPS_PRIVATE_HOST: "screeps.com"
      })
    ).toThrow(/official Screeps endpoint/);
  });

  test("builds Docker Compose commands from the repository root", () => {
    const config = readPrivateServerConfig({ SCREEPS_TARGET: "private", SCREEPS_PRIVATE_TESTING: "true" });

    expect(buildComposeArgs(config, "start")).toEqual([
      "compose",
      "-p",
      "agentic-screeps-private",
      "-f",
      "infrastructure/private-server/docker-compose.yml",
      "up",
      "-d"
    ]);
    expect(buildComposeArgs(config, "stop")).toContain("down");
    expect(buildComposeArgs(config, "logs")).toEqual([
      "compose",
      "-p",
      "agentic-screeps-private",
      "-f",
      "infrastructure/private-server/docker-compose.yml",
      "logs",
      "--tail",
      "200"
    ]);
  });

  test("reports stopped status when the local endpoint is unavailable", async () => {
    const status = await getPrivateServerStatus({
      config: readPrivateServerConfig({ SCREEPS_TARGET: "private", SCREEPS_PRIVATE_TESTING: "true" }),
      fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    });

    expect(status.running).toBe(false);
    expect(status.endpoint).toBe("http://127.0.0.1:21025");
    expect(status.error).toContain("unreachable");
  });

  test("reports running status with version and game tick when APIs respond", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: "4.3.0" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ time: 1234 }), { status: 200 }));

    const status = await getPrivateServerStatus({
      config: readPrivateServerConfig({ SCREEPS_TARGET: "private", SCREEPS_PRIVATE_TESTING: "true" }),
      fetchImpl
    });

    expect(status).toMatchObject({
      running: true,
      endpoint: "http://127.0.0.1:21025",
      version: "4.3.0",
      tick: 1234
    });
  });

  test("dispatches status without shelling out and start through docker", async () => {
    const dir = await mkdtemp(join(tmpdir(), "private-screeps-no-env-"));
    const execFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    try {
      await runPrivateServerCommand(["status"], {
        cwd: dir,
        env: { SCREEPS_TARGET: "private", SCREEPS_PRIVATE_TESTING: "true" },
        execFile,
        fetchImpl,
        stdout: vi.fn(),
        stderr: vi.fn()
      });
      expect(execFile).not.toHaveBeenCalled();

      await runPrivateServerCommand(["start"], {
        cwd: dir,
        env: {
          SCREEPS_TARGET: "private",
          SCREEPS_PRIVATE_TESTING: "true",
          SCREEPS_TOKEN: "public-token",
          STEAM_KEY: "local-steam-key"
        },
        execFile,
        fetchImpl,
        waitTimeoutMs: 0,
        stdout: vi.fn(),
        stderr: vi.fn()
      });
      expect(execFile).toHaveBeenCalledWith(
        "docker",
        expect.arrayContaining(["compose", "up", "-d"]),
        expect.objectContaining({
          cwd: process.cwd(),
          env: expect.objectContaining({ STEAM_KEY: "local-steam-key" })
        })
      );
      expect(execFile.mock.calls.at(-1)[2].env.SCREEPS_TOKEN).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("forwards docker log output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "private-screeps-no-env-"));
    const stdout = vi.fn();
    const execFile = vi.fn().mockResolvedValue({ stdout: "server log\n", stderr: "" });

    try {
      await runPrivateServerCommand(["logs"], {
        cwd: dir,
        env: { SCREEPS_TARGET: "private", SCREEPS_PRIVATE_TESTING: "true" },
        execFile,
        stdout,
        stderr: vi.fn()
      });

      expect(stdout).toHaveBeenCalledWith("server log\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("prepares the ignored data directory with the sample launcher config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "private-screeps-data-"));
    try {
      await preparePrivateServerDataDir({ dataDir: dir });

      const config = await readFile(join(dir, "config.yml"), "utf8");
      expect(config).toContain("screepsmod-auth");
      expect(config).toContain("screepsmod-admin-utils");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("passes the Steam key through Docker Compose without hard-coding a value", async () => {
    const compose = await readFile("infrastructure/private-server/docker-compose.yml", "utf8");

    expect(compose).toContain("STEAM_KEY");
    expect(compose).toContain("${STEAM_KEY:-}");
  });

  test("loads project .env values without overriding explicit environment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "private-screeps-env-"));
    try {
      await writeFile(
        join(dir, ".env"),
        [
          "SCREEPS_PRIVATE_TESTING=true",
          "SCREEPS_TARGET=private",
          "SCREEPS_PRIVATE_PORT=21099",
          "SCREEPS_PRIVATE_USERNAME=agentic-bot",
          "STEAM_KEY=local-steam-key",
          "SCREEPS_PRIVATE_PASSWORD=\"quoted password\""
        ].join("\n"),
        "utf8"
      );

      const env = await loadProjectEnvironment({
        cwd: dir,
        env: { SCREEPS_PRIVATE_PORT: "21100" }
      });

      expect(env.SCREEPS_PRIVATE_TESTING).toBe("true");
      expect(env.SCREEPS_PRIVATE_PORT).toBe("21100");
      expect(env.SCREEPS_PRIVATE_USERNAME).toBe("agentic-bot");
      expect(env.STEAM_KEY).toBe("local-steam-key");
      expect(env.SCREEPS_PRIVATE_PASSWORD).toBe("quoted password");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
