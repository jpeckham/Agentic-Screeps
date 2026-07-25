import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const workflowPath = ".github/workflows/ci-cd.yml";

describe("GitHub CI/CD workflow", () => {
  test("runs and deploys on every push while keeping pull requests build-only", async () => {
    const workflow = await readFile(workflowPath, "utf8");

    const pushBlock = workflow.match(/^ {2}push:\n(?<body>(?: {4}.*\n)*)/m);
    expect(pushBlock?.groups?.body ?? "").not.toMatch(/branches:/);
    expect(workflow).toContain(
      "if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'"
    );
  });
});
