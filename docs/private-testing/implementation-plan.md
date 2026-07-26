# Screeps Private Testing Implementation Plan

Goal: build a repeatable local Screeps: World testing environment that starts a
private server, resets a deterministic world, deploys the current bot, runs
combat scenarios, asserts outcomes, writes reports, and exits nonzero on
failure.

## Global Constraints

- Keep private testing isolated from production deployment.
- Do not read or reuse `SCREEPS_TOKEN` for private deployment or seeding.
- Destructive commands require `SCREEPS_PRIVATE_TESTING=true`.
- Refuse official Screeps endpoints such as `screeps.com`.
- Support Windows through npm and Node.js commands.
- Do not claim real scenario success unless a real private server ran.
- Do not push or deploy to the official world.

## Slice T0: Audit And Runtime Decision

Objective: document repo architecture, available local tools, private-server
options, manual prerequisites, and the selected runtime direction.

Files expected to change:

- `docs/private-testing/README.md`
- `docs/private-testing/manual-prerequisites.md`
- `docs/private-testing/architecture.md`

Prerequisites:

- npm registry access for package metadata
- web access for official/private-server source documentation

Acceptance criteria:

- Node/npm/Docker versions are recorded.
- Build artifact and production deployment path are recorded.
- Official server and launcher requirements are documented with source links.
- Unresolved Steam/auth prerequisites are called out instead of guessed.

Verification commands:

- `node --version`
- `npm --version`
- `docker --version`
- `docker compose version`

Manual steps:

- None for audit.

Out of scope:

- Running the server.

Status: complete for local evidence capture; runtime selection remains open until
the first real server bootstrap is exercised.

## Slice T1: Private Configuration And Safety Guardrails

Objective: create a reusable private-test configuration module that all future
destructive and deployment commands must use.

Files expected to change:

- `src/private-testing/config.ts`
- `test/unit/private-testing-config.test.ts`
- `.env.example`
- `.gitignore`

Prerequisites:

- Existing TypeScript/Vitest setup.

Acceptance criteria:

- Defaults point to localhost.
- Destructive mode requires `SCREEPS_PRIVATE_TESTING=true`.
- Official endpoints are refused.
- `SCREEPS_TOKEN` presence is refused for private commands.
- Local data and generated reports are ignored by Git.

Verification commands:

- `npm test -- test/unit/private-testing-config.test.ts`
- `npm run typecheck`

Manual steps:

- Developers copy private variables into a local `.env` or shell environment as needed.

Out of scope:

- Server startup, seeding, and deployment.

Status: implemented and verified with `npm test --
test/unit/private-testing-config.test.ts` and `npm run typecheck`.

## Slice T2: Server Health And Lifecycle

Objective: add npm commands and Node scripts to start, stop, inspect, and tail a
private server without touching production state.

Files expected to change:

- `package.json`
- `scripts/private-screeps.mjs`
- `infrastructure/private-server/config/`
- `test/unit/private-server-lifecycle.test.ts`

Prerequisites:

- Final runtime choice from T0.
- Docker Desktop if Docker Compose is selected.

Acceptance criteria:

- `npm run screeps:start` starts or confirms an existing local server.
- `npm run screeps:stop` stops only the managed local server.
- `npm run screeps:status` prints machine-readable running/stopped status.
- Startup waits for readiness and reports useful failures.
- Logs are accessible through `npm run screeps:logs`.

Verification commands:

- `npm test -- test/unit/private-server-lifecycle.test.ts`
- `npm run screeps:status`

Manual steps:

- Install and start Docker Desktop if Docker is selected.

Out of scope:

- World seeding and assertions.

Status: partially implemented. `npm run screeps:start`, `screeps:stop`,
`screeps:status`, and `screeps:logs` are wired to a Docker Compose launcher
scaffold with safety guards, local config preparation, and unit coverage. Docker
Compose config validates. A real startup attempt initialized dependencies but
did not reach readiness because `STEAM_KEY` is required.

## Slice T3: Local Bot Deployment

Objective: reuse the existing build artifact and upload it only to the private
server branch.

Files expected to change:

- `scripts/deploy-local-screeps.mjs`
- `src/private-testing/local-client.ts`
- `test/unit/private-deployment.test.ts`
- `package.json`

Prerequisites:

- T1 guardrails.
- T2 health command.
- Private-server auth path validated.

Acceptance criteria:

- `npm run screeps:deploy:local` builds `dist/main.js`.
- Upload targets only the private endpoint and `SCREEPS_PRIVATE_BRANCH`.
- Official credentials are never read.
- Uploaded module list and entry module are verified.

Verification commands:

- `npm test -- test/unit/private-deployment.test.ts`
- `npm run screeps:deploy:local`

Manual steps:

- Complete selected auth setup if not fully automatable.

Out of scope:

- Scenario execution.

Status: partially implemented. `npm run screeps:deploy:local` builds the current
release artifact, refuses production token/official endpoints, authenticates
with private username/password, uploads to `SCREEPS_PRIVATE_BRANCH`, and verifies
the uploaded modules. Unit tests cover workflow and client behavior. A real
upload is blocked until the private server reaches readiness.

## Slice T4: Deterministic Reset And Baseline Seed

Objective: provide repeatable reset and owned-room baseline seeding.

Files expected to change:

- `src/private-testing/world-reset.ts`
- `src/private-testing/world-seeder.ts`
- `scripts/private-screeps-seed.mjs`
- `test/unit/private-world-seeding.test.ts`
- `docs/private-testing/architecture.md`

Prerequisites:

- T2 server CLI/API access.

Acceptance criteria:

- `npm run screeps:reset` clears prior scenario state.
- `npm run screeps:seed` creates one deterministic owned RCL3/RCL4 room.
- Seeder verifies spawn, tower, sources, controller ownership, and no hostiles.
- Repeated reset/seed produces the same baseline summary.

Verification commands:

- `npm test -- test/unit/private-world-seeding.test.ts`
- `npm run screeps:reset`
- `npm run screeps:seed`

Manual steps:

- None beyond server prerequisites.

Out of scope:

- Combat scenario assertions.

Status: partially implemented. Deterministic reset and owned-colony seed plans
are implemented with unit tests. `npm run screeps:reset` and `npm run
screeps:seed` are wired to `screeps-launcher cli`, and `--print` mode verifies
generated scripts without a running server. Real reset/seed execution is blocked
until the private server reaches readiness.

## Slice T5: Scenario Data And Assertions

Objective: define data-driven combat scenarios and a small assertion engine.

Files expected to change:

- `test/scenarios/definitions/*.json`
- `src/private-testing/scenarios.ts`
- `src/private-testing/assertions.ts`
- `src/private-testing/reporter.ts`
- `test/unit/private-scenarios.test.ts`
- `test/unit/private-assertions.test.ts`

Prerequisites:

- T4 baseline model.

Acceptance criteria:

- Scenario data contains no arbitrary executable code.
- Invalid body parts, coordinates, names, and assertions fail validation.
- Assertion categories cover equality, one-of, within-N-ticks, unchanged,
  exists, not-exists, hit-point decrease, posture transition, and no runtime
  exception.
- Human-readable and JSON reports are generated under `test-results/`.

Verification commands:

- `npm test -- test/unit/private-scenarios.test.ts test/unit/private-assertions.test.ts`

Manual steps:

- None.

Out of scope:

- Real tick advancement.

Status: partially implemented. Assertion evaluation, scenario JSON validation,
deterministic scenario loading, initial scenario definitions, and report writing
are implemented and covered by unit tests. Real state collection and tick
execution remain pending.

## Slice T6: Scenario Runner And Combat Suite

Objective: run named scenarios against the real private server for bounded ticks.

Files expected to change:

- `scripts/run-private-scenario.mjs`
- `src/private-testing/scenario-runner.ts`
- `test/scenarios/assertions/`
- `package.json`
- `docs/private-testing/scenarios.md`

Prerequisites:

- T2 through T5.

Acceptance criteria:

- `npm run screeps:scenario -- melee-attacker` resets, deploys, seeds, runs,
  collects telemetry, evaluates assertions, and exits correctly.
- `--keep-world` preserves failed state for debugging.
- `--verbose` prints state checkpoints.
- Initial scenarios include no-hostile baseline, unarmed scout, melee attacker,
  healer and attacker, and threat disappears.

Verification commands:

- `npm run screeps:scenario -- no-hostile-baseline`
- `npm run screeps:scenario -- unarmed-scout`
- `npm run screeps:scenario -- melee-attacker`

Manual steps:

- None beyond server prerequisites.

Out of scope:

- Dashboard or advanced enemy AI.

Status: partially implemented. `npm run screeps:scenario -- <name>`,
`npm run test:screeps-smoke`, and `npm run test:combat` are wired. They load
scenario definitions, check private-server status, write reports under
`test-results/private-scenarios/`, and exit nonzero when the server is stopped.
Bot-side `Memory.testing` telemetry and the memory-to-observation collector are
implemented and unit-tested. Private-server Memory read wiring, real tick
execution, cleanup options, and passing real-server scenario assertions remain
pending.

## Slice T7: One-Command Combat Workflow

Objective: provide `npm run test:combat` as the complete developer workflow.

Files expected to change:

- `scripts/test-combat.mjs`
- `package.json`
- `docs/private-testing/troubleshooting.md`

Prerequisites:

- T2 through T6.

Acceptance criteria:

- Starts the server if needed and does not stop a server it did not start.
- Builds and deploys the bot locally.
- Runs all combat scenarios.
- Preserves logs and reports on failure.
- Exits nonzero on assertion failure.

Verification commands:

- `npm run test:combat`
- `npm run test:screeps-smoke`

Manual steps:

- None beyond server prerequisites.

Out of scope:

- Production deployment.

Status: partially implemented. `npm run test:combat` exists and runs all
committed combat scenario definitions, but currently fails nonzero because the
private server is unavailable and real state collection is pending. Start/stop
ownership tracking and automatic deploy/reset/seed orchestration remain pending.

## Slice T8: Reliability And Completion Verification

Objective: harden cleanup, docs, and full-suite verification.

Files expected to change:

- `docs/private-testing/manual-prerequisites.md`
- `docs/private-testing/troubleshooting.md`
- `docs/private-testing/scenarios.md`
- harness tests touched by reliability fixes

Prerequisites:

- T7 working end to end.

Acceptance criteria:

- Existing gameplay tests pass.
- Harness unit tests pass.
- Real private-server smoke and combat runs are recorded.
- Completion report lists implemented architecture, files changed, scenarios,
  assertions, test results, limitations, and confirmation that no official
  deployment occurred.

Verification commands:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run verify`
- `npm run test:screeps-smoke`
- `npm run test:combat`

Manual steps:

- Any remaining validated external prerequisite must be documented with exact
  verification instructions.

Out of scope:

- Pushing changes.

Status: pending.
