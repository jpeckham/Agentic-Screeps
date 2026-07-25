import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export interface ReleaseManifestModule {
  name: string;
  file: string;
  sha256: string;
}

export interface ReleaseManifest {
  releaseId: string;
  gitSha: string;
  shortGitSha: string;
  buildTimestamp: string;
  version?: string;
  entryModule: string;
  modules: ReleaseManifestModule[];
}

export interface CreateReleaseManifestOptions {
  distDir: string;
  entryModule: string;
  gitSha: string;
  buildTimestamp: string;
  version?: string;
}

const forbiddenPatterns = [
  /\.map$/i,
  /\.ts$/i,
  /^\.env/i,
  /fixture/i,
  /secret/i
];

export async function createReleaseManifest(
  options: CreateReleaseManifestOptions
): Promise<ReleaseManifest> {
  await assertNoForbiddenFiles(options.distDir);
  const files = (await readdir(options.distDir))
    .filter((file) => extname(file) === ".js")
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    throw new Error("Cannot create release manifest for an empty build.");
  }

  const modules = await Promise.all(
    files.map(async (file) => {
      const contents = await readFile(join(options.distDir, file));
      return {
        name: basename(file, ".js"),
        file,
        sha256: sha256(contents)
      };
    })
  );

  if (!modules.some((module) => module.name === options.entryModule)) {
    throw new Error(`Expected entry module "${options.entryModule}" was not present.`);
  }

  const shortGitSha = options.gitSha.slice(0, 8);
  return {
    releaseId: `release-${shortGitSha}`,
    gitSha: options.gitSha,
    shortGitSha,
    buildTimestamp: options.buildTimestamp,
    ...(options.version ? { version: options.version } : {}),
    entryModule: options.entryModule,
    modules
  };
}

export async function verifyReleaseManifest(
  manifest: ReleaseManifest,
  distDir: string
): Promise<void> {
  await assertNoForbiddenFiles(distDir);
  const actual = await createReleaseManifest({
    distDir,
    entryModule: manifest.entryModule,
    gitSha: manifest.gitSha,
    buildTimestamp: manifest.buildTimestamp,
    ...(manifest.version ? { version: manifest.version } : {})
  });

  const expected = JSON.stringify(manifest.modules);
  const received = JSON.stringify(actual.modules);
  if (expected !== received) {
    throw new Error("Release artifact appears tampered: module hashes changed.");
  }
}

export function assertManifestSafe(manifest: ReleaseManifest): void {
  if (!manifest.releaseId.startsWith("release-")) {
    throw new Error("Release manifest has an invalid release identifier.");
  }
  if (!manifest.modules.some((module) => module.name === manifest.entryModule)) {
    throw new Error(`Release manifest missing entry module "${manifest.entryModule}".`);
  }
}

async function assertNoForbiddenFiles(distDir: string): Promise<void> {
  const files = await readdir(distDir);
  const forbidden = files.find((file) =>
    forbiddenPatterns.some((pattern) => pattern.test(file))
  );
  if (forbidden) {
    throw new Error(`Forbidden file "${forbidden}" cannot be included in release artifact.`);
  }
}

function sha256(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}
