export interface UploadingClient {
  uploadModules(branch: string, modules: Record<string, string>): Promise<void>;
  getActiveBranch(): Promise<string>;
  readModules(branch: string): Promise<Record<string, string>>;
  activateBranch(branch: string): Promise<void>;
}

export interface RollbackClient {
  listBranches(): Promise<string[]>;
  getActiveBranch(): Promise<string>;
  activateBranch(branch: string): Promise<void>;
}

export interface ReleaseDeployment {
  client: UploadingClient;
  branch: string;
  modules: Record<string, string>;
  releaseId: string;
  entryModule: string;
}

export async function deployCandidate(options: ReleaseDeployment): Promise<void> {
  const activeBranch = await options.client.getActiveBranch();
  if (activeBranch === options.branch) {
    throw new Error("Candidate branch is currently active; refusing candidate upload.");
  }
  await options.client.uploadModules(options.branch, options.modules);
  await verifyRemoteCandidate(options);
}

export async function activateVerifiedRelease(
  options: ReleaseDeployment
): Promise<{ previousBranch: string; activatedBranch: string }> {
  const previousBranch = await options.client.getActiveBranch();
  if (previousBranch === options.branch) {
    throw new Error("Target branch is already active.");
  }
  await options.client.uploadModules(options.branch, options.modules);
  await verifyRemoteCandidate(options);
  await options.client.activateBranch(options.branch);
  return { previousBranch, activatedBranch: options.branch };
}

export async function rollbackToBranch(options: {
  client: RollbackClient;
  targetBranch: string;
}): Promise<{ previousBranch: string; activatedBranch: string }> {
  if (!options.targetBranch.trim()) {
    throw new Error("Rollback requires an explicit target branch.");
  }
  const branches = await options.client.listBranches();
  if (!branches.includes(options.targetBranch)) {
    throw new Error(`Rollback target branch "${options.targetBranch}" does not exist.`);
  }
  const previousBranch = await options.client.getActiveBranch();
  await options.client.activateBranch(options.targetBranch);
  return { previousBranch, activatedBranch: options.targetBranch };
}

async function verifyRemoteCandidate(options: ReleaseDeployment): Promise<void> {
  const uploaded = await options.client.readModules(options.branch);
  const uploadedNames = Object.keys(uploaded).sort();
  const expectedNames = Object.keys(options.modules).sort();
  if (JSON.stringify(uploadedNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Remote candidate could not be verified: module list mismatch.");
  }
  if (!(options.entryModule in uploaded)) {
    throw new Error("Remote candidate could not be verified: entry module missing.");
  }
  if (!Object.values(uploaded).some((contents) => contents.includes(options.releaseId))) {
    throw new Error("Remote candidate could not be verified: release identifier missing.");
  }
  for (const [name, contents] of Object.entries(options.modules)) {
    if (uploaded[name] !== contents) {
      throw new Error(`Remote candidate could not be verified: module "${name}" mismatch.`);
    }
  }
}
