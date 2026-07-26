import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ModulePayload } from "../deploy/artifact.js";
import { createPrivateTestingConfig } from "./config.js";
import { LocalScreepsClient } from "./local-client.js";

export interface LocalDeploymentClient {
  uploadModules(branch: string, modules: Record<string, string>): Promise<void>;
  readModules(branch: string): Promise<Record<string, string>>;
}

export interface LocalDeploymentOptions {
  manifestPath: string;
  env?: Record<string, string | undefined>;
  client?: LocalDeploymentClient;
}

export interface LocalDeploymentResult {
  endpoint: string;
  branch: string;
  moduleCount: number;
  entryModule: string;
  releaseId: string;
}

interface ReleaseManifest {
  releaseId: string;
  entryModule: string;
  modules: Array<{
    name: string;
    file: string;
  }>;
}

export async function deployLocalBot(options: LocalDeploymentOptions): Promise<LocalDeploymentResult> {
  const config = createPrivateTestingConfig(options.env, { destructive: true });
  const manifest = await readManifest(options.manifestPath);
  const payload = await readManifestModules(dirname(options.manifestPath), manifest);
  const client = options.client ?? new LocalScreepsClient({
    endpoint: config.endpoint,
    username: config.username,
    password: config.password
  });

  await client.uploadModules(config.branch, payload.modules);
  await verifyUploadedModules({
    client,
    branch: config.branch,
    modules: payload.modules,
    entryModule: manifest.entryModule,
    releaseId: manifest.releaseId
  });

  return {
    endpoint: config.endpoint,
    branch: config.branch,
    moduleCount: Object.keys(payload.modules).length,
    entryModule: manifest.entryModule,
    releaseId: manifest.releaseId
  };
}

async function readManifest(path: string): Promise<ReleaseManifest> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isManifest(value)) throw new Error("Release manifest is malformed.");
  return value;
}

async function readManifestModules(distDir: string, manifest: ReleaseManifest): Promise<ModulePayload> {
  const modules: Record<string, string> = {};
  for (const module of manifest.modules) {
    modules[module.name] = await readFile(join(distDir, module.file), "utf8");
  }
  if (!(manifest.entryModule in modules)) {
    throw new Error(`Private deployment refused: entry module "${manifest.entryModule}" missing.`);
  }
  return { modules };
}

async function verifyUploadedModules(options: {
  client: LocalDeploymentClient;
  branch: string;
  modules: Record<string, string>;
  entryModule: string;
  releaseId: string;
}): Promise<void> {
  const uploaded = await options.client.readModules(options.branch);
  const uploadedNames = Object.keys(uploaded).sort();
  const expectedNames = Object.keys(options.modules).sort();
  if (JSON.stringify(uploadedNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Private deployment verification failed: module list mismatch. Uploaded ${JSON.stringify(uploadedNames)}.`
    );
  }
  if (!(options.entryModule in uploaded)) {
    throw new Error("Private deployment verification failed: entry module missing.");
  }
  if (!Object.values(uploaded).some((contents) => contents.includes(options.releaseId))) {
    throw new Error("Private deployment verification failed: release identifier missing.");
  }
  for (const [name, contents] of Object.entries(options.modules)) {
    if (uploaded[name] !== contents) {
      throw new Error(`Private deployment verification failed: module "${name}" mismatch.`);
    }
  }
}

function isManifest(value: unknown): value is ReleaseManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { releaseId?: unknown }).releaseId === "string" &&
    typeof (value as { entryModule?: unknown }).entryModule === "string" &&
    Array.isArray((value as { modules?: unknown }).modules) &&
    (value as { modules: unknown[] }).modules.every(
      (module) =>
        typeof module === "object" &&
        module !== null &&
        typeof (module as { name?: unknown }).name === "string" &&
        typeof (module as { file?: unknown }).file === "string"
    )
  );
}
