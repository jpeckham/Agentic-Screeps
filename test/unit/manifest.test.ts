import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  createReleaseManifest,
  verifyReleaseManifest
} from "../../src/build/manifest.js";

describe("release manifest", () => {
  test("orders modules deterministically and hashes all JavaScript modules", async () => {
    const dir = await mkdtemp(join(tmpdir(), "manifest-"));
    try {
      await writeFile(join(dir, "zeta.js"), "module.exports.z = true;");
      await writeFile(join(dir, "main.js"), "module.exports.loop = () => {};");
      await writeFile(join(dir, "alpha.js"), "module.exports.a = true;");

      const manifest = await createReleaseManifest({
        distDir: dir,
        entryModule: "main",
        gitSha: "1234567890abcdef",
        buildTimestamp: "2026-07-25T12:00:00.000Z",
        version: "0.1.0"
      });

      expect(manifest.releaseId).toBe("release-12345678");
      expect(manifest.modules.map((module) => module.name)).toEqual([
        "alpha",
        "main",
        "zeta"
      ]);
      expect(manifest.modules.every((module) => module.sha256.length === 64)).toBe(
        true
      );
      expect(manifest.entryModule).toBe("main");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("detects artifact tampering and rejects source or secret files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "manifest-"));
    try {
      await writeFile(join(dir, "main.js"), "module.exports.loop = () => {};");
      const manifest = await createReleaseManifest({
        distDir: dir,
        entryModule: "main",
        gitSha: "abcdef1234567890",
        buildTimestamp: "2026-07-25T12:00:00.000Z"
      });

      await writeFile(join(dir, "main.js"), "module.exports.loop = () => 1;");
      await writeFile(join(dir, ".env"), "SCREEPS_TOKEN=secret");

      await expect(verifyReleaseManifest(manifest, dir)).rejects.toThrow(
        /tampered|forbidden/i
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects missing entry modules and empty builds", async () => {
    const dir = await mkdtemp(join(tmpdir(), "manifest-"));
    try {
      await expect(
        createReleaseManifest({
          distDir: dir,
          entryModule: "main",
          gitSha: "abcdef1234567890",
          buildTimestamp: "2026-07-25T12:00:00.000Z"
        })
      ).rejects.toThrow(/empty/i);

      await writeFile(join(dir, "helper.js"), "module.exports.x = true;");
      await expect(
        createReleaseManifest({
          distDir: dir,
          entryModule: "main",
          gitSha: "abcdef1234567890",
          buildTimestamp: "2026-07-25T12:00:00.000Z"
        })
      ).rejects.toThrow(/entry module/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
