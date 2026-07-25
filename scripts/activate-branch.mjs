import { activateBranch, getActiveBranch, readConfig } from "./screeps-api.mjs";

const targetBranch = process.env.SCREEPS_BRANCH ?? process.argv[2];
const confirmation = process.env.CONFIRM_DEPLOY ?? process.argv[3];
if (confirmation !== "DEPLOY") {
  throw new Error('Production deployment refused: confirmation must equal "DEPLOY".');
}
if (!targetBranch) {
  throw new Error("Production deployment refused: target Screeps branch is required.");
}

const config = readConfig();
const previousBranch = await getActiveBranch(config);
if (previousBranch === targetBranch) {
  throw new Error(`Production deployment refused: "${targetBranch}" is already active.`);
}
await activateBranch(config, targetBranch);

console.log(`✓ Previous active branch: ${previousBranch}`);
console.log(`✓ Activated ${targetBranch}`);
