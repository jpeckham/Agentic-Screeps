import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { readConfig, readModules, uploadModules } from "./screeps-api.mjs";

const manifestPath = resolve(process.argv[2] ?? "dist/release-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const distDir = dirname(manifestPath);
const branch = process.env.SCREEPS_BRANCH ?? "agentic";
const config = readConfig();
const modules = {};

for (const module of manifest.modules) {
  modules[module.name] = await readFile(join(distDir, module.file), "utf8");
}

await uploadModules(config, branch, modules);

const uploaded = await readModules(config, branch);
const uploadedNames = Object.keys(uploaded).sort();
const expectedNames = Object.keys(modules).sort();
const missingNames = expectedNames.filter((name) => !uploadedNames.includes(name));
if (missingNames.length > 0) {
  throw new Error("Live deploy verification failed: module list mismatch.");
}
if (!uploaded[manifest.entryModule]) {
  throw new Error(`Live deploy verification failed: missing "${manifest.entryModule}".`);
}
if (!Object.values(uploaded).some((contents) => contents.includes(manifest.releaseId))) {
  throw new Error("Live deploy verification failed: release identifier missing.");
}
for (const [name, contents] of Object.entries(modules)) {
  if (uploaded[name] !== contents) {
    throw new Error(`Live deploy verification failed: module "${name}" mismatch.`);
  }
}

console.log(`✓ Uploaded ${expectedNames.length} modules to ${branch}`);
console.log(`✓ Remote live branch verified`);
console.log(`Deployed branch: ${branch}`);
