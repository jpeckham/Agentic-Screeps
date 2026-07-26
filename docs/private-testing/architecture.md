# Private Testing Architecture

The harness is being built as isolated infrastructure around the existing bot.
Production deployment scripts remain separate and continue to use `SCREEPS_TOKEN`.

## Implemented Boundaries

`src/private-testing/config.ts`

- Owns local endpoint and credential configuration.
- Refuses official endpoints.
- Requires `SCREEPS_TARGET=private` and ignores public `SCREEPS_TOKEN` values.
- Requires `SCREEPS_PRIVATE_TESTING=true` for destructive commands.

`src/private-testing/assertions.ts`

- Evaluates data-only scenario assertions against ordered observations.
- Produces structured pass/fail results for future reporters and process exit
  handling.

`src/private-testing/scenarios.ts`

- Loads committed JSON scenario definitions.
- Validates supported hostile fixtures, body parts, coordinates, and assertion
  types.
- Sorts scenarios by name for deterministic execution.

`src/private-testing/reporter.ts`

- Writes text and JSON reports for evaluated scenario assertions.
- Provides pass/fail and failure count metadata for future CLI exit handling.

`src/private-testing/local-client.ts`

- Authenticates against the private server using local username/password.
- Uses the returned local token for code upload and verification.
- Reads Memory from the private API for scenario telemetry collection.

`src/private-testing/local-deployment.ts`

- Reads `dist/release-manifest.json`.
- Uploads the current bot artifact to `SCREEPS_PRIVATE_BRANCH`.
- Verifies uploaded module names, entry module, release id, and exact contents.
- Reuses private testing guardrails so official-world credentials and endpoints
  are refused.

`src/private-testing/world-reset.ts`

- Builds the deterministic reset plan for the private test room.
- Clears test creeps, room objects, flags, terrain, room records, user code,
  console output, and Memory for the bot and hostile users.
- Ensures local bot and enemy users exist in the private server database.

`src/private-testing/world-seeder.ts`

- Defines the deterministic owned-colony baseline for `E1S1`.
- Seeds an RCL3 controller, one spawn, one tower, five extensions, and two
  sources with stable coordinates and object ids.
- Validates room coordinates and duplicate object ids before producing a CLI
  script.

`src/private-testing/hostile-injection.ts`

- Converts scenario hostile fixtures into deterministic private-server creep
  records.
- Validates hostile room, coordinates, body parts, action metadata, and hit
  points.
- Produces a CLI script that creates the local enemy user, removes prior matching
  hostile records, and inserts hostile room objects.

`src/private-testing/scenario-runner.ts`

- Loads a named data-only scenario.
- Checks private-server status before evaluating assertions.
- Supports lifecycle hooks for reset, baseline seed, local deployment, and
  hostile injection before observation collection.
- Writes failed reports when the server is stopped or real observation
  collection is unavailable.
- Evaluates supplied observations in unit tests without fabricating real server
  state.

`src/private-testing/bot-telemetry.ts`

- Writes compact `Memory.testing` observations only when
  `Memory.config.privateTestingEnabled === true`.
- Records tick, threat severity, defensive posture, hostile count, selected
  target, pending de-escalation state, and tower attack/hold action.

`src/private-testing/state-collector.ts`

- Converts `Memory.testing.colonies[roomName]` into scenario observations for
  assertion evaluation.
- Includes runtime top-level failure messages as `runtimeExceptions`.

`src/private-testing/memory-observation-provider.ts`

- Connects the authenticated local client to the Memory telemetry collector.
- Provides the `ScenarioObservation[]` supplier expected by the scenario
  runner.

## Target Boundaries

`PrivateServerRuntime`

- Starts, stops, checks health, tails logs, and manages local state.

`WorldReset`

- Clears scenario state and recreates a known baseline.

`WorldSeeder`

- Creates the deterministic owned colony and hostile fixtures.

`LocalBotDeployer`

- Builds the existing release artifact and uploads it only to the private server.

`ScenarioRunner`

- Orchestrates reset, deploy, seed, tick execution, state collection,
  assertions, cleanup, and exit codes.

`StateCollector`

- Reads bot telemetry, room state, hostile state, tick number, and runtime errors.

`TestReporter`

- Prints concise pass/fail output and writes JSON reports under `test-results/`.

## Runtime Choice Status

The current implementation uses the `screepers/screeps-launcher` Docker image
through `infrastructure/private-server/docker-compose.yml`. This is not yet a
complete passing runtime because the first real startup reached a verified
`STEAM_KEY` prerequisite before HTTP readiness.

- `screepers/screeps-launcher` with Docker Compose: documented as an easy
  Windows path, with Docker images and CLI access. Docker Compose syntax
  validates in this repo.
- Official `screeps` npm package: current package metadata supports Node 22+,
  matching this repository. It remains a fallback if launcher authentication
  blocks automation.
