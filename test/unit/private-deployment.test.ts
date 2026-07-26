import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import { deployLocalBot } from "../../src/private-testing/local-deployment.js";

describe("private local deployment", () => {
  test("uploads release modules to the configured private branch and verifies them", async () => {
    const dist = await mkdtemp(join(tmpdir(), "private-deploy-"));
    try {
      await writeFile(
        join(dist, "release-manifest.json"),
        JSON.stringify({
          releaseId: "release-local123",
          entryModule: "main",
          modules: [{ name: "main", file: "main.js" }]
        })
      );
      await writeFile(join(dist, "main.js"), "/* release-local123 */ module.exports.loop = () => {};");

      const client = {
        uploadModules: vi.fn().mockResolvedValue(undefined),
        readModules: vi.fn().mockResolvedValue({
          main: "/* release-local123 */ module.exports.loop = () => {};"
        })
      };

      const result = await deployLocalBot({
        manifestPath: join(dist, "release-manifest.json"),
        env: {
          SCREEPS_TARGET: "private",
          SCREEPS_PRIVATE_TESTING: "true",
          SCREEPS_PRIVATE_HOST: "127.0.0.1",
          SCREEPS_PRIVATE_BRANCH: "private-test"
        },
        client
      });

      expect(client.uploadModules).toHaveBeenCalledWith("private-test", {
        main: "/* release-local123 */ module.exports.loop = () => {};"
      });
      expect(client.readModules).toHaveBeenCalledWith("private-test");
      expect(result).toEqual({
        endpoint: "http://127.0.0.1:21025",
        branch: "private-test",
        moduleCount: 1,
        entryModule: "main",
        releaseId: "release-local123"
      });
    } finally {
      await rm(dist, { recursive: true, force: true });
    }
  });

  test("allows public token coexistence and refuses official-endpoint private deploy configuration", async () => {
    const dist = await mkdtemp(join(tmpdir(), "private-deploy-token-"));
    const client = {
      uploadModules: vi.fn().mockResolvedValue(undefined),
      readModules: vi.fn().mockResolvedValue({
        main: "/* release-local123 */ module.exports.loop = () => {};"
      })
    };

    try {
      await writeFile(
        join(dist, "release-manifest.json"),
        JSON.stringify({
          releaseId: "release-local123",
          entryModule: "main",
          modules: [{ name: "main", file: "main.js" }]
        })
      );
      await writeFile(join(dist, "main.js"), "/* release-local123 */ module.exports.loop = () => {};");

      await expect(
        deployLocalBot({
          manifestPath: join(dist, "release-manifest.json"),
          env: {
            SCREEPS_TARGET: "private",
            SCREEPS_PRIVATE_TESTING: "true",
            SCREEPS_TOKEN: "prod-token"
          },
          client
        })
      ).resolves.toMatchObject({
        endpoint: "http://127.0.0.1:21025",
        branch: "private-combat"
      });
    } finally {
      await rm(dist, { recursive: true, force: true });
    }

    await expect(
      deployLocalBot({
        manifestPath: "dist/release-manifest.json",
        env: {
          SCREEPS_TARGET: "private",
          SCREEPS_PRIVATE_TESTING: "true",
          SCREEPS_PRIVATE_HOST: "screeps.com"
        },
        client
      })
    ).rejects.toThrow(/official Screeps endpoint/);

    expect(client.uploadModules).toHaveBeenCalledTimes(1);
  });

  test("fails safely when uploaded modules cannot be verified", async () => {
    const dist = await mkdtemp(join(tmpdir(), "private-deploy-"));
    try {
      await writeFile(
        join(dist, "release-manifest.json"),
        JSON.stringify({
          releaseId: "release-local123",
          entryModule: "main",
          modules: [{ name: "main", file: "main.js" }]
        })
      );
      await writeFile(join(dist, "main.js"), "/* release-local123 */ module.exports.loop = () => {};");

      await expect(
        deployLocalBot({
          manifestPath: join(dist, "release-manifest.json"),
          env: { SCREEPS_TARGET: "private", SCREEPS_PRIVATE_TESTING: "true" },
          client: {
            uploadModules: vi.fn().mockResolvedValue(undefined),
            readModules: vi.fn().mockResolvedValue({})
          }
        })
      ).rejects.toThrow(/entry module missing|module list mismatch/);
    } finally {
      await rm(dist, { recursive: true, force: true });
    }
  });
});
