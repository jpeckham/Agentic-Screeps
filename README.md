# Agentic Screeps

Production-safe CI/CD harness for a Screeps AI. Git is the source of truth; live production deployment is intentionally separated from commit and push.

## Intended Flow

Pushing code does **not** deploy to the live Screeps environment.

The production path is:

1. Develop locally and run verification.
2. Commit and push a branch.
3. Open a pull request.
4. Let the pull request workflow run typecheck, lint, tests, coverage, build, manifest verification, and artifact upload.
5. Merge to `main` after required checks pass.
6. Let the release candidate workflow build one immutable artifact.
7. Manually dispatch the production deploy workflow with the existing artifact details.
8. Approve the protected `screeps-production` GitHub Environment.
9. The workflow uploads to an inactive Screeps release branch, verifies it, records the previous active branch, then activates the new branch.
10. Roll back only through the explicit rollback workflow and an explicit target branch.

## One-Time Setup

Install dependencies:

```bash
npm ci
```

Configure GitHub:

1. Create a `screeps-candidate` environment.
2. Create a `screeps-production` environment.
3. Add required reviewers to `screeps-production`.
4. Add the environment secrets and variables from [Secrets, Variables, And Workflow Inputs](#secrets-variables-and-workflow-inputs).
5. Optionally enable secret scanning and push protection.
6. Protect `main` and require the pull request verification check.

Do not put Screeps tokens in source, `.env`, command arguments, URLs, branch names, or build artifacts.

## Secrets, Variables, And Workflow Inputs

GitHub has two relevant storage types:

- **Secrets**: encrypted values, masked in logs. Use these for tokens.
- **Variables**: plain configuration values visible to repository admins. Use these only for non-secret values.

Set environment secrets and variables in GitHub:

1. Open the repository on GitHub.
2. Go to **Settings**.
3. Open **Environments**.
4. Select `screeps-candidate` or `screeps-production`.
5. Under **Environment secrets**, choose **Add secret**.
6. Under **Environment variables**, choose **Add variable**.

Required environment secret:

| Name | Type | Where | Value |
| --- | --- | --- | --- |
| `SCREEPS_TOKEN` | GitHub Environment secret | `screeps-candidate` if uploading candidates; `screeps-production` for production deploy/rollback | A Screeps auth token. Treat it like a password. It should be narrowly scoped if Screeps supports scoping for your account/API setup. |

Recommended environment variables:

| Name | Type | Where | Value |
| --- | --- | --- | --- |
| `SCREEPS_HOST` | GitHub Environment variable | `screeps-candidate`, `screeps-production` | Screeps API origin URL. For the official MMO, use `https://screeps.com`. |
| `SCREEPS_SHARD` | GitHub Environment variable | `screeps-candidate`, `screeps-production` | Optional shard label, such as `shard3`. This is currently carried for operator context and future shard-aware behavior. |

Workflow inputs are entered when you click **Run workflow**. They are not stored secrets.

| Workflow | Input | Type | Value |
| --- | --- | --- | --- |
| `Release Candidate` | `upload_candidate` | Choice | `false` for build-only; `true` to upload the artifact to an inactive Screeps candidate branch. |
| `Release Candidate` | `branch` | String | Optional inactive Screeps branch name. Leave blank to use the generated `release-<short-sha>` branch. |
| `Production Deploy` | `artifact_run_id` | String | The GitHub Actions run id that produced the immutable release artifact. |
| `Production Deploy` | `artifact_name` | String | The artifact name from the release candidate run, such as `screeps-release-6e43144a` or `screeps-release-<full-github-sha>`. |
| `Production Deploy` | `target_branch` | String | The inactive Screeps branch to upload/verify/activate, usually `release-<short-sha>`. |
| `Production Deploy` | `confirmation` | String | Must be exactly `DEPLOY`. |
| `Production Rollback` | `target_branch` | String | The explicit known-good Screeps branch to activate. Never leave this to guesswork. |
| `Production Rollback` | `confirmation` | String | Must be exactly `ROLLBACK`. |

Local-only environment variables used by scripts:

| Name | Type | Value |
| --- | --- | --- |
| `SCREEPS_TOKEN` | Secret environment variable | Screeps auth token. Prefer GitHub secrets for real deployments. |
| `SCREEPS_HOST` | Environment variable | Optional. Defaults to `https://screeps.com`. |
| `SCREEPS_BRANCH` | Environment variable | Target Screeps branch for candidate upload, activation, or rollback. |
| `SCREEPS_SHARD` | Environment variable | Optional shard label. |
| `CONFIRM_DEPLOY` | Environment variable | Must be exactly `DEPLOY` for production activation. |
| `CONFIRM_ROLLBACK` | Environment variable | Must be exactly `ROLLBACK` for rollback. |

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

## Release Candidate

After the pull request is merged to `main`, GitHub runs `.github/workflows/release-candidate.yml`.

That workflow:

- runs `npm run verify`
- builds once
- uploads an immutable `dist/` artifact
- optionally uploads to an inactive candidate Screeps branch
- never activates production

To manually create a release candidate in GitHub:

1. Open **Actions**.
2. Select **Release Candidate**.
3. Choose **Run workflow**.
4. Leave `upload_candidate` as `false` unless you have configured the `screeps-candidate` environment.
5. If uploading a candidate, provide an inactive branch name or use the generated `release-<short-sha>` name.

Record from the completed workflow:

- workflow run id
- artifact name
- release id
- candidate branch

## Production Deploy

Production deploy is manual only.

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

The production deploy workflow does not rebuild. It downloads the existing artifact, verifies hashes, uploads the exact modules to the target branch, verifies the remote candidate, records rollback metadata, and then activates the branch.

## Rollback

Rollback is manual only and never guesses a target.

In GitHub:

1. Open **Actions**.
2. Select **Production Rollback**.
3. Choose **Run workflow**.
4. Enter the explicit known-good target branch.
5. Enter confirmation exactly as `ROLLBACK`.
6. Approve the `screeps-production` environment gate.
7. Confirm the summary shows the intended rollback branch activated.

Before rollback, check whether Memory schema changes are compatible with the target release. If they are not compatible, deploy a forward fix instead.

## Local Deployment Commands

These commands exist so GitHub Actions can reuse the scripts. Do not run them against live production from a workstation.

Upload an inactive candidate branch:

```bash
SCREEPS_TOKEN=... SCREEPS_BRANCH=release-abc12345 npm run deploy:candidate
```

Activate a branch:

```bash
SCREEPS_TOKEN=... SCREEPS_BRANCH=release-abc12345 CONFIRM_DEPLOY=DEPLOY npm run deploy:production
```

Rollback to an explicit branch:

```bash
SCREEPS_TOKEN=... SCREEPS_BRANCH=release-previous CONFIRM_ROLLBACK=ROLLBACK npm run rollback:production
```

Prefer the GitHub workflows for any real deployment so approval, artifact immutability, summaries, and rollback metadata are preserved.

## More Documentation

- [CI/CD policy](docs/cicd.md)
- [Deployment](docs/deployment.md)
- [Rollback](docs/rollback.md)
- [GitHub setup](docs/github-setup.md)
- [Memory migrations](docs/memory-migrations.md)
