# GitHub Setup

Create environments:

- `screeps-production`: contains production `SCREEPS_TOKEN` for auto deploy to Screeps branch `agentic`.

Do not configure required reviewers on `screeps-production` if you want true automatic deploy after merge to `main`. Add reviewers only if you want GitHub to pause the auto deploy job for approval.

Environment variables:

- `SCREEPS_HOST`: usually `https://screeps.com`.
- `SCREEPS_SHARD`: optional shard label for operator context.

Branch protection for `main`:

- Require pull request reviews.
- Require `Pull Request / verify`.
- Require branches to be up to date before merge if your team uses linear release gates.
- Prevent force pushes.

Workflow permissions should default to read-only. The workflows in this repo request only `contents: read`, plus `actions: read` where production deploy downloads an existing artifact.

Create a narrowly scoped Screeps auth token. Store it only as an environment secret named `SCREEPS_TOKEN`; never place it in `.env`, command history, artifact files, branch names, URLs, or logs. Enable secret scanning/push protection if available for the repository.

Production and rollback share the same concurrency group, preventing overlapping activations.

Auto deploy uses concurrency group `screeps-agentic-live`, so pushes to `main` deploy serially.
