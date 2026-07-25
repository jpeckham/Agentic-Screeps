export interface UploadingClient {
  uploadModules(branch: string, modules: Record<string, string>): Promise<void>;
  getActiveBranch(): Promise<string>;
  readModules(branch: string): Promise<Record<string, string>>;
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

export async function deployLive(
  options: ReleaseDeployment
): Promise<{ activeBranch: string; deployedBranch: string }> {
  const activeBranch = await options.client.getActiveBranch();
  await options.client.uploadModules(options.branch, options.modules);
  await verifyRemoteCandidate(options);
  return { activeBranch, deployedBranch: options.branch };
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
