export interface UploadingClient {
  uploadModules(branch: string, modules: Record<string, string>): Promise<void>;
  getActiveBranch(): Promise<string>;
  readModules(branch: string): Promise<Record<string, string>>;
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
  await verifyRemoteCandidate(options, { allowExtraModules: true });
  return { activeBranch, deployedBranch: options.branch };
}

async function verifyRemoteCandidate(
  options: ReleaseDeployment,
  verification: { allowExtraModules?: boolean } = {}
): Promise<void> {
  const uploaded = await options.client.readModules(options.branch);
  const uploadedNames = Object.keys(uploaded).sort();
  const expectedNames = Object.keys(options.modules).sort();
  const missingNames = expectedNames.filter((name) => !uploadedNames.includes(name));
  if (missingNames.length > 0 || (!verification.allowExtraModules && JSON.stringify(uploadedNames) !== JSON.stringify(expectedNames))) {
    throw new Error(
      `Remote candidate could not be verified: module list mismatch. Missing ${JSON.stringify(missingNames)}; uploaded ${JSON.stringify(uploadedNames)}.`
    );
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
