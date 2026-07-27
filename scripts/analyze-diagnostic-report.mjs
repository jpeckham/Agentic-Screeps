import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

await mkdir(".tmp", { recursive: true });
const outfile = ".tmp/analyze-diagnostic-report-cli.mjs";
await build({
  entryPoints: ["scripts/analyze-diagnostic-report-entry.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  sourcemap: false,
  logLevel: "silent"
});
await import(pathToFileURL(outfile).href);
