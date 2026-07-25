import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export interface ModulePayload {
  modules: Record<string, string>;
}

export async function buildModulePayload(
  distDir: string,
  entryModule: string
): Promise<ModulePayload> {
  const files = (await readdir(distDir)).sort((left, right) =>
    left.localeCompare(right)
  );
  const unsafe = files.find((file) => extname(file) !== ".js");
  if (unsafe) {
    throw new Error(`Rejecting non-JavaScript file in release artifact: ${unsafe}`);
  }
  if (files.length === 0) {
    throw new Error("Rejecting empty build artifact.");
  }

  const modules: Record<string, string> = {};
  for (const file of files) {
    modules[basename(file, ".js")] = await readFile(join(distDir, file), "utf8");
  }

  if (!(entryModule in modules)) {
    throw new Error(`Deployment refused: expected entry module "${entryModule}" was not present.`);
  }

  return { modules };
}
