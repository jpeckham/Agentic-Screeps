# Production Deployment

1. Merge through a pull request after all required checks pass.
2. Let `Auto Deploy` run on `main`, or dispatch it manually.
3. Confirm the summary shows the release id and Screeps branch `agentic`.
4. Confirm Screeps branch `agentic` contains the uploaded code.

The deploy job builds once through `npm run verify`, uploads the immutable artifact for inspection, then uploads that verified output to Screeps branch `agentic`.

Local production deployment is intentionally discouraged. The local command exists for workflow reuse:

```bash
SCREEPS_BRANCH=agentic npm run deploy:live
```

Do not run it against production from a workstation.
