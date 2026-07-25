# Production Deployment

1. Merge through a pull request after all required checks pass.
2. Let `Release Candidate` run on `main`, or dispatch it manually.
3. Note the workflow run id and artifact name from the candidate run.
4. Dispatch `Production Deploy`.
5. Provide the artifact run id, artifact name, inactive target branch, and confirmation `DEPLOY`.
6. Approve the `screeps-production` GitHub Environment gate.
7. Confirm the summary shows the uploaded candidate, previous active branch, and activated branch.

The deploy job never rebuilds. It uses the downloaded artifact exactly as verified by `scripts/verify-release.mjs`.

Local production deployment is intentionally discouraged. The local command exists for workflow reuse:

```bash
SCREEPS_BRANCH=release-abc12345 CONFIRM_DEPLOY=DEPLOY npm run deploy:production
```

Do not run it against production from a workstation.
