import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { readConfig, getActiveBranch, readModules, uploadModules } from "./screeps-api.mjs";

const manifestPath = resolve(process.argv[2] ?? "dist/release-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const distDir = dirname(manifestPath);
const branch = process.env.SCREEPS_BRANCH ?? manifest.releaseId;
const config = readConfig();
const modules = {};

for (const module of manifest.modules) {
  modules[module.name] = await readFile(join(distDir, module.file), "utf8");
}

const active = await getActiveBranch(config);
if (active === branch) {
  throw new Error(`Candidate deployment refused: branch "${branch}" is currently active.`);
}

await uploadModules(config, branch, modules);
const uploaded = await readModules(config, branch);
const uploadedNames = Object.keys(uploaded).sort();
const expectedNames = Object.keys(modules).sort();
if (JSON.stringify(uploadedNames) !== JSON.stringify(expectedNames)) {
  throw new Error("Remote candidate verification failed: module list mismatch.");
}
if (!uploaded[manifest.entryModule]) {
  throw new Error(`Remote candidate verification failed: missing "${manifest.entryModule}".`);
}
if (!Object.values(uploaded).some((contents) => contents.includes(manifest.releaseId))) {
  throw new Error("Remote candidate verification failed: release identifier missing.");
}

console.log(`✓ Uploaded ${expectedNames.length} modules to ${branch}`);
console.log("✓ Remote candidate verified");
console.log(`Candidate branch: ${branch}`);
