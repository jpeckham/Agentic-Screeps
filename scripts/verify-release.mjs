import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const manifestPath = resolve(process.argv[2] ?? "dist/release-manifest.json");
const distDir = dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const files = await readdir(distDir);
const forbidden = files.find((file) =>
  [/\.map$/i, /\.ts$/i, /^\.env/i, /fixture/i, /secret/i].some((pattern) =>
    pattern.test(file)
  )
);
if (forbidden) fail(`Forbidden artifact file detected: ${forbidden}`);
if (!manifest.releaseId?.startsWith("release-")) fail("Invalid release identifier.");
if (!Array.isArray(manifest.modules) || manifest.modules.length === 0) {
  fail("Release manifest contains no modules.");
}
if (!manifest.modules.some((module) => module.name === manifest.entryModule)) {
  fail(`Expected entry module "${manifest.entryModule}" was not present.`);
}

for (const module of manifest.modules) {
  const bytes = await readFile(join(distDir, module.file));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== module.sha256) {
    fail(`Artifact tampering detected for module "${module.name}".`);
  }
  const text = bytes.toString("utf8");
  if (!text.includes(manifest.releaseId)) {
    fail(`Release identifier ${manifest.releaseId} missing from ${module.file}.`);
  }
  if (/SCREEPS_TOKEN|X-Token:\s*\w/i.test(text)) {
    fail(`Potential secret text found in ${module.file}.`);
  }
}

console.log("✓ Release manifest verified");

function fail(message) {
  console.error(`Verification failed: ${message}`);
  process.exit(1);
}
