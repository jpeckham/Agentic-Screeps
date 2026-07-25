# Agentic Screeps

Production-safe CI/CD harness for a Screeps AI. Git is the source of truth; `main` is the production gate.

## Intended Flow

Pushing directly to `main`, or merging a pull request into `main`, deploys to the remote Screeps branch `default` after verification passes.

The production path is:

1. Develop locally and run verification.
2. Commit and push a branch.
3. Open a pull request.
4. Let the pull request workflow run typecheck, lint, tests, coverage, build, manifest verification, and artifact upload.
5. Merge to `main` after required checks pass.
6. The `CI/CD` workflow runs `npm run verify`.
7. The workflow uploads the immutable `dist/` artifact for inspection.
8. The workflow uploads the verified artifact to Screeps branch `default`.
9. If production breaks, fix forward through a new commit to `main`.

## One-Time Setup

Install dependencies:

```bash
npm ci
```

Configure GitHub:

1. Create a `screeps-production` environment.
2. Add the `SCREEPS_TOKEN` environment secret from [Secrets, Variables, And Workflow Inputs](#secrets-variables-and-workflow-inputs).
3. Optionally enable secret scanning and push protection.
4. Protect `main` and require the pull request verification check.
5. Do not require manual reviewers on `screeps-production` if you want true automatic deploy after merge.

Do not put Screeps tokens in source, `.env`, command arguments, URLs, branch names, or build artifacts.

## Secrets, Variables, And Workflow Inputs

GitHub has two relevant storage types:

- **Secrets**: encrypted values, masked in logs. Use these for tokens.
- **Variables**: plain configuration values visible to repository admins. Use these only for non-secret values.

Set environment secrets and variables in GitHub:

1. Open the repository on GitHub.
2. Go to **Settings**.
3. Open **Environments**.
4. Select `screeps-production`.
5. Under **Environment secrets**, choose **Add secret**.
6. Under **Environment variables**, choose **Add variable**.

Required environment secret:

| Name | Type | Where | Value |
| --- | --- | --- | --- |
| `SCREEPS_TOKEN` | GitHub Environment secret | `screeps-production` | A Screeps auth token. Treat it like a password. It should be narrowly scoped if Screeps supports scoping for your account/API setup. |

Optional environment variables:

| Name | Type | Where | Value |
| --- | --- | --- | --- |
| `SCREEPS_HOST` | GitHub Environment variable | `screeps-production` | Optional. Leave unset for the official MMO; scripts default to `https://screeps.com`. Set only for private servers or PTR-style hosts. |
| `SCREEPS_SHARD` | GitHub Environment variable | `screeps-production` | Optional shard label, such as `shard3`. This is currently carried for operator context and future shard-aware behavior. |

Workflow inputs are entered when you click **Run workflow**. They are not stored secrets.

| Workflow | Input | Type | Value |
| --- | --- | --- | --- |
| `CI/CD` | none | none | Runs automatically on pull requests and pushes to `main`. Pull requests build/test only; pushes to `main` deploy to branch `default`. Manual dispatch also deploys to `default`. |
| `Production Deploy` | `artifact_run_id` | String | The GitHub Actions run id that produced the immutable release artifact. |
| `Production Deploy` | `artifact_name` | String | The artifact name from the auto deploy run, such as `screeps-release-6e43144a` or `screeps-release-<full-github-sha>`. |
| `Production Deploy` | `target_branch` | String | The inactive Screeps branch to upload/verify/activate, usually `release-<short-sha>`. |
| `Production Deploy` | `confirmation` | String | Must be exactly `DEPLOY`. |

Local-only environment variables used by scripts:

| Name | Type | Value |
| --- | --- | --- |
| `SCREEPS_TOKEN` | Secret environment variable | Screeps auth token. Prefer GitHub secrets for real deployments. |
| `SCREEPS_HOST` | Environment variable | Optional. Defaults to `https://screeps.com`. |
| `SCREEPS_BRANCH` | Environment variable | Target Screeps branch for candidate upload or activation. |
| `SCREEPS_SHARD` | Environment variable | Optional shard label. |
| `CONFIRM_DEPLOY` | Environment variable | Must be exactly `DEPLOY` for production activation. |

For local experiments, copy `.env.example` to a local `.env` file only if your shell tooling loads it. `.env` is ignored by Git. Do not commit `.env`, and do not use local commands for real production deployment.

## Local Development Commands

Run the full local gate:

```bash
npm run verify
```

Run individual checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run build
node scripts/verify-release.mjs dist/release-manifest.json
```

The build writes `dist/main.js` and `dist/release-manifest.json`. `dist/` is generated output and should not be edited manually.

## Commit And Push

Create a branch:

```bash
git switch -c my-change
```

Verify before committing:

```bash
npm run verify
```

Commit:

```bash
git add .
git commit -m "feat: describe change"
```

Push:

```bash
git push -u origin my-change
```

Open a pull request on GitHub. The pull request workflow has no Screeps token and cannot deploy production.

## CI/CD

After the pull request is merged to `main`, GitHub runs `.github/workflows/ci-cd.yml`, shown in Actions as **CI/CD**.

That workflow:

- runs `npm run verify`
- builds once
- uploads an immutable `dist/` artifact
- uploads the verified artifact to Screeps branch `default` only for pushes to `main` or manual dispatch

To manually rerun the same deploy in GitHub:

1. Open **Actions**.
2. Select **CI/CD**.
3. Choose **Run workflow**.

Record from the completed workflow:

- workflow run id
- artifact name
- release id
- deployed Screeps branch, always `default`

## Production Deploy

Normal production deploy is automatic on merge to `main`. This manual workflow remains available only for an unusual artifact redeploy or branch-slot deployment.

In GitHub:

1. Open **Actions**.
2. Select **Production Deploy**.
3. Choose **Run workflow**.
4. Enter the release candidate workflow run id.
5. Enter the artifact name.
6. Enter the inactive Screeps target branch, for example `release-abc12345`.
7. Enter confirmation exactly as `DEPLOY`.
8. Approve the `screeps-production` environment gate.
9. Read the workflow summary and confirm the previous active branch and activated branch.

The manual production deploy workflow does not rebuild. It downloads the existing artifact, verifies hashes, uploads the exact modules to the target branch, verifies the remote candidate, and then activates the branch.

## Fix Forward

There is no production rollback workflow. If live Screeps code is bad, make the smallest safe fix, verify locally, merge to `main`, and let CI/CD update `default`.

For urgent fixes:

1. Create a branch from current `main`.
2. Patch the issue.
3. Run `npm run verify`.
4. Open and merge a pull request, or push directly to `main` if you intentionally bypass PR review.
5. Watch **CI/CD** finish successfully.

## Local Deployment Commands

These commands exist so GitHub Actions can reuse the scripts. Do not run them against live production from a workstation.

Upload to the live `default` branch:

```bash
SCREEPS_TOKEN=... SCREEPS_BRANCH=default npm run deploy:live
```

Upload an inactive candidate branch for testing:

```bash
SCREEPS_TOKEN=... SCREEPS_BRANCH=release-abc12345 npm run deploy:candidate
```

Prefer the GitHub workflow for real deployment so CI verification, artifact immutability, and summaries are preserved.

## More Documentation

- [CI/CD policy](docs/cicd.md)
- [Deployment](docs/deployment.md)
- [GitHub setup](docs/github-setup.md)
- [Memory migrations](docs/memory-migrations.md)
