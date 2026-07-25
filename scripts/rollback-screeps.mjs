import { activateBranch, getActiveBranch, listBranches, readConfig } from "./screeps-api.mjs";

const targetBranch = process.env.SCREEPS_BRANCH ?? process.argv[2];
const confirmation = process.env.CONFIRM_ROLLBACK ?? process.argv[3];
if (confirmation !== "ROLLBACK") {
  throw new Error('Rollback refused: confirmation must equal "ROLLBACK".');
}
if (!targetBranch) {
  throw new Error("Rollback refused: explicit target branch is required.");
}

const config = readConfig();
const active = await getActiveBranch(config);
const branches = await listBranches(config);
if (!branches.includes(targetBranch)) {
  throw new Error(`Rollback refused: target branch "${targetBranch}" does not exist.`);
}
await activateBranch(config, targetBranch);

console.log(`Current active branch before rollback: ${active}`);
console.log(`✓ Activated rollback branch ${targetBranch}`);
