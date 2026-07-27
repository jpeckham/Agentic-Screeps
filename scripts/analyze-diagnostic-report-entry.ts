import { runDiagnosticAnalysisCli } from "../src/diagnostics/analysis/diagnostic-analysis-cli.js";

process.exitCode = await runDiagnosticAnalysisCli(process.argv.slice(2), process.env);
