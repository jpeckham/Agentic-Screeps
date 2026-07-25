import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const distDir = join(root, "dist");
const entryModule = "main";

const gitSha = process.env.GITHUB_SHA ?? git("rev-parse", "HEAD");
const shortGitSha = gitSha.slice(0, 8);
const buildTimestamp = process.env.BUILD_TIMESTAMP ?? new Date().toISOString();
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const releaseId = `release-${shortGitSha}`;

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [join(root, "src", "main.ts")],
  bundle: true,
  outfile: join(distDir, "main.js"),
  platform: "neutral",
  format: "cjs",
  target: "es2022",
  sourcemap: false,
  legalComments: "none",
  banner: {
    js: `/* ${releaseId} ${gitSha} ${buildTimestamp} */`
  },
  define: {
    __BUILD_GIT_SHA__: JSON.stringify(gitSha),
    __BUILD_SHORT_GIT_SHA__: JSON.stringify(shortGitSha),
    __BUILD_RELEASE_ID__: JSON.stringify(releaseId),
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __BUILD_VERSION__: JSON.stringify(version)
  }
});

const manifest = await createManifest();
await writeFile(
  join(distDir, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(`✓ Built ${manifest.releaseId}`);
console.log(`✓ Generated release manifest with ${manifest.modules.length} module(s)`);

async function createManifest() {
  const files = (await readdir(distDir))
    .filter((file) => extname(file) === ".js")
    .sort((left, right) => left.localeCompare(right));
  if (files.length === 0) throw new Error("Build produced no JavaScript modules.");
  const modules = [];
  for (const file of files) {
    const bytes = await readFile(join(distDir, file));
    modules.push({
      name: basename(file, ".js"),
      file,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  if (!modules.some((module) => module.name === entryModule)) {
    throw new Error(`Build missing expected entry module "${entryModule}".`);
  }
  return {
    releaseId,
    gitSha,
    shortGitSha,
    buildTimestamp,
    version,
    entryModule,
    modules
  };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
