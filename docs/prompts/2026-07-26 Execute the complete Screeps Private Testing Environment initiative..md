Execute the complete Screeps Private Testing Environment initiative.

This is a large infrastructure initiative. Do not attempt to implement it as one uncontrolled change.

Your first responsibility is to inspect the repository, design the solution, and decompose the initiative into small independently verifiable implementation slices. Then execute those slices sequentially unless blocked by a manual prerequisite.

Do not merely create documentation and stop. Documentation and decomposition are the first deliverables; working infrastructure is the final deliverable.

# Goal

Create a repeatable local Screeps: World testing environment capable of:

- starting a private Screeps server
- resetting it to a known state
- deploying the current bot build
- creating a deterministic owned colony
- creating a hostile test user
- injecting combat scenarios
- advancing or observing ticks
- reading game state and bot telemetry
- asserting expected outcomes
- producing a clear pass/fail report

The finished developer workflow should be approximately:

1. Start the private server.
2. Reset and seed the test world.
3. Build and deploy the bot locally.
4. Start a named scenario.
5. Run the scenario for a bounded number of ticks.
6. Collect state and telemetry.
7. Evaluate assertions.
8. Print a test report.
9. Exit with a nonzero code when assertions fail.

Target command:

npm run test:combat

Additional commands may include:

npm run screeps:start
npm run screeps:stop
npm run screeps:reset
npm run screeps:seed
npm run screeps:deploy:local
npm run screeps:scenario -- melee-attacker
npm run screeps:status
npm run screeps:logs

Adapt command names to repository conventions.

# Important operating instructions

Before implementation:

1. Inspect the repository architecture, package scripts, build output, deployment code, configuration conventions, tests, and documentation.
2. Determine whether any private-server infrastructure already exists.
3. Research the currently supported Screeps private-server setup using authoritative documentation and official repositories where possible.
4. Identify which parts can run without Steam credentials or interactive account setup.
5. Identify any unavoidable manual prerequisites.
6. Produce an implementation plan split into small slices.
7. Record explicit acceptance criteria and verification commands for every slice.

After planning, begin implementing the slices in dependency order.

Do not stop merely because a plan file exists.

# Scope

The initiative includes:

- private-server runtime
- repeatable server startup and shutdown
- isolated local configuration
- deterministic world reset
- test users
- owned-room seeding
- hostile creep injection
- local bot deployment
- scenario definitions
- scenario execution
- state collection
- assertions
- reports
- documentation
- tests for the harness itself where practical

The initiative does not include:

- production deployment
- modification of official-world credentials
- modification of existing protected deployment behavior
- advanced combat AI
- replacing current gameplay unit tests
- a graphical test dashboard
- Kubernetes
- cloud hosting
- public internet exposure
- large-scale performance testing
- multiplayer matchmaking
- Screeps Arena conversion

# Architectural principles

Keep private testing isolated from production.

Use an architecture similar to:

PrivateServerRuntime
  -> WorldReset
  -> WorldSeeder
  -> LocalBotDeployer
  -> ScenarioRunner
  -> StateCollector
  -> AssertionEngine
  -> TestReporter

Suggested boundaries:

- infrastructure/private-server
- infrastructure/private-server/scripts
- infrastructure/private-server/config
- test/scenarios
- test/scenarios/definitions
- test/scenarios/assertions
- test/fixtures/enemy-bot
- docs/private-testing

Adapt paths to the repository.

Do not scatter server-specific logic throughout gameplay code.

# Phase 1: Repository audit and feasibility

Inspect and report:

- Node.js and npm versions
- TypeScript build system
- generated Screeps artifact location
- existing deployment mechanism
- current environment-variable conventions
- test framework
- Docker availability assumptions
- operating-system assumptions
- whether Windows development is supported
- whether Docker Desktop is required
- whether the official private server can be run reliably in containers
- whether a native Node.js setup is more appropriate
- private-server API or CLI access needed for seeding
- authentication requirements
- expected ports
- data persistence mechanism
- reset strategy

Do not claim a Docker setup is supported without confirming it against current server behavior.

Choose the simplest reproducible approach that works for this repository.

# Phase 2: Initiative decomposition

Create a plan with small slices.

The plan should normally resemble:

Slice T1: Private server bootstrap
Slice T2: Server health and lifecycle scripts
Slice T3: Local bot deployment
Slice T4: Deterministic world reset
Slice T5: Owned colony seeding
Slice T6: Hostile test-user seeding
Slice T7: Scenario definition format
Slice T8: Scenario runner
Slice T9: State and telemetry collection
Slice T10: Assertion engine
Slice T11: Combat scenario suite
Slice T12: One-command integration test
Slice T13: Reliability and cleanup hardening

Change the decomposition when repository or server constraints justify it.

For each slice document:

- objective
- files expected to change
- prerequisites
- acceptance criteria
- verification commands
- manual steps, if any
- explicit out-of-scope items

Commit slices separately when repository policy permits. Do not push unless explicitly authorized.

# Phase 3: Private server bootstrap

Provide a reproducible local runtime.

Prefer one of:

- Docker Compose
- repository-local native Node.js scripts

Choose based on confirmed compatibility, not assumption.

Requirements:

- one command starts the server
- one command stops it
- server state is stored outside production paths
- ports are configurable
- startup waits for readiness
- startup fails clearly when dependencies are missing
- startup is safe to run repeatedly
- no production Screeps token is needed
- local secrets are excluded from Git
- sample environment configuration is committed
- actual local configuration is ignored

Example configuration values:

SCREEPS_PRIVATE_HOST
SCREEPS_PRIVATE_PORT
SCREEPS_PRIVATE_PROTOCOL
SCREEPS_PRIVATE_USERNAME
SCREEPS_PRIVATE_PASSWORD
SCREEPS_PRIVATE_BRANCH
SCREEPS_PRIVATE_DATA_DIR

Use only values actually required by the selected implementation.

# Phase 4: Server health and lifecycle

Implement reliable lifecycle handling.

Required behavior:

- detect whether the server is already running
- wait for a health/readiness condition
- report useful startup failures
- shut down cleanly
- expose server logs
- prevent commands from silently targeting the official Screeps world
- support a clean local data volume
- support a persistent local data volume for debugging
- work from the repository root

Add a machine-readable health command.

Example:

npm run screeps:status

Expected output should identify:

- running or stopped
- server endpoint
- server version when available
- current game tick when available
- active local users when available

# Phase 5: Local deployment

Reuse the existing build pipeline where practical.

Requirements:

- build the same artifact used by normal deployment
- upload it to the private server only
- use a clearly local branch name
- never read official-world credentials for local deployment
- verify the uploaded module exists
- produce a clear deployment result
- support repeatable redeployment
- fail safely when the server is unavailable

Example:

npm run screeps:deploy:local

Do not modify protected production deployment behavior unless a small shared abstraction is clearly safe and fully tested.

# Phase 6: Deterministic reset

Implement a repeatable test-world reset.

Requirements:

- stop or pause relevant processing safely
- clear test-world state
- preserve server installation
- recreate required users and baseline data
- reset the game tick or record a known starting tick where supported
- remove prior creeps, structures, construction sites, flags, and scenario state
- clear or replace bot Memory
- produce the same baseline on repeated runs
- fail clearly when reset is incomplete

Provide separate modes if appropriate:

- quick scenario reset
- complete server-data reset

Do not depend on manual deletion of random directories after initial setup.

# Phase 7: Owned colony seeding

Create one deterministic player colony.

Suggested baseline:

- one owned room
- controller at RCL3 or RCL4
- one spawn
- enough extensions for useful spawning
- one tower
- one or two sources
- optional source containers
- known terrain and structure coordinates
- sufficient initial energy
- no accidental hostile units
- current bot user assigned ownership

The exact RCL should support testing tower behavior immediately.

The seeder must:

- use stable room and object placement
- avoid invalid terrain
- verify seeded objects
- print a concise summary
- be safe after a full reset
- fail when the baseline cannot be created

Avoid creating an unrealistically complete endgame base.

# Phase 8: Hostile test user

Create an isolated enemy test user.

Requirements:

- deterministic username
- no production credentials
- enemy ownership clearly distinct from the bot
- ability to create hostile creeps for scenarios
- ability to remove or reset hostile creeps
- no autonomous behavior unless a scenario requires it

Prefer direct scenario seeding over building an elaborate enemy AI.

A minimal enemy bot may be added only when movement across ticks is required.

# Phase 9: Scenario format

Create a small data-driven scenario definition.

Suggested shape:

interface CombatScenario {
  name: string;
  description: string;
  initialState: ScenarioInitialState;
  durationTicks: number;
  hostileCreeps: HostileCreepFixture[];
  assertions: ScenarioAssertion[];
}

Suggested hostile fixture:

interface HostileCreepFixture {
  name: string;
  body: BodyPartConstant[];
  roomName: string;
  x: number;
  y: number;
  hits?: number;
  action?: "hold" | "approachSpawn" | "attackSpawn";
}

Adapt this to the available private-server APIs.

Do not allow arbitrary executable code in simple scenario data unless unavoidable.

# Phase 10: Initial scenarios

Implement at least these deterministic scenarios:

## no-hostile baseline

Given:

- seeded owned room
- no hostile creeps

Assert:

- bot loop runs without exception
- threat severity is NONE
- defensive posture is PEACE
- tower does not attack

## unarmed scout

Given:

- one hostile with MOVE parts only

Assert:

- hostile count becomes one
- threat severity becomes LOW
- defensive posture becomes ALERT
- tower behavior matches current implemented policy

Do not assert future tower behavior that is not implemented yet.

## melee attacker

Given:

- one hostile with MOVE and ATTACK
- hostile placed within useful tower range

Assert:

- threat severity becomes MEDIUM or repository-equivalent
- posture becomes ENGAGE
- after Slice 3B1 exists, tower attacks the selected hostile

If tower attack has not yet been merged when this harness is implemented, mark that assertion pending rather than fabricating success.

## healer and attacker

Given:

- one attacker
- one healer

Assert after target-selection behavior exists:

- severity becomes HIGH
- the colony selects the intended priority target
- all towers focus the same target

## threat disappears

Given:

- room begins in ENGAGE
- hostile is removed

Assert:

- posture remains engaged during the configured delayed disengagement
- pending de-escalation state is visible in collected memory
- posture changes only after the configured boundary

# Phase 11: Tick execution

Create a bounded scenario runner.

It must:

1. Confirm the server is ready.
2. Reset to the baseline.
3. Deploy the current bot.
4. Seed the selected scenario.
5. Record the starting tick.
6. Observe or advance the configured number of ticks.
7. Collect state at relevant checkpoints.
8. Evaluate assertions.
9. Clean up or preserve state according to options.
10. Exit with an appropriate process code.

Support a debugging option that leaves the failed world running.

Example:

npm run screeps:scenario -- melee-attacker
npm run screeps:scenario -- melee-attacker --keep-world
npm run screeps:scenario -- melee-attacker --verbose

Use repository-compatible argument parsing.

Do not implement a large command framework unless already present.

# Phase 12: State and telemetry collection

Collect only what tests need.

Possible sources:

- bot Memory
- room state
- creep state
- tower energy and cooldown
- hostile hit points
- persisted defensive posture
- selected target ID
- console logs
- game tick
- uncaught loop errors

Prefer adding a compact test-observation object to Memory only when no better inspection mechanism exists.

Any test-only instrumentation must:

- be disabled outside the private-test environment
- be small
- not expose credentials
- not alter production decisions
- have explicit typing
- be clearly namespaced

Example:

Memory.testing = {
  tick: Game.time,
  colonies: {
    E1S1: {
      threat: "high",
      posture: "engage",
      selectedTargetId: "...",
      towerAction: "attack"
    }
  }
};

Do not add this exact structure if current telemetry already provides the necessary data.

# Phase 13: Assertions and reports

Build a small assertion engine.

Required assertion categories:

- value equals
- value is one of
- value becomes true within N ticks
- value remains unchanged for N ticks
- object exists
- object does not exist
- hit points decreased
- posture transition occurred
- no runtime exception occurred

Produce concise output such as:

PASS melee-attacker
  PASS threat severity became MEDIUM
  PASS posture became ENGAGE
  PASS tower attacked hostile
  PASS no runtime exceptions

On failure:

FAIL healer-priority
  PASS posture became ENGAGE
  FAIL selected target
       expected healer-1
       actual attacker-1
       observed at tick 184

Also produce a machine-readable JSON report under a generated artifacts or test-results directory.

Generated reports must be ignored by Git unless repository convention says otherwise.

# Phase 14: One-command test workflow

Provide:

npm run test:combat

It should:

- start the private server when needed
- wait for readiness
- build the bot
- run the combat scenarios
- print a summary
- return nonzero on failure
- stop the server when the command started it
- preserve logs and reports on failure
- avoid stopping a server that was already running unless explicitly requested

A narrower smoke command may also be provided:

npm run test:screeps-smoke

# Phase 15: Harness tests

Test the harness itself where practical.

Include tests for:

- scenario parsing
- assertion evaluation
- timeout behavior
- invalid scenario configuration
- deterministic ordering
- report generation
- environment guardrails
- refusal to use official endpoints
- lifecycle cleanup
- failure exit codes

Do not mock the entire private server and claim that proves integration.

At least one real local smoke scenario must exercise the actual server.

# Safety guardrails

Implement hard protections.

The private harness must refuse to run destructive or seeding commands when:

- the host matches an official Screeps endpoint
- local-test mode is not explicitly enabled
- required local environment markers are missing
- a production token is detected where local credentials are expected

Use an explicit marker such as:

SCREEPS_PRIVATE_TESTING=true

Destructive commands must check this marker and the endpoint.

Never print passwords or tokens.

Never commit local credentials.

# Manual prerequisites

Determine and document exactly what the developer must do manually.

Likely possibilities include:

- install Docker Desktop
- enable virtualization
- install a compatible Node.js version
- perform one-time Steam-related setup if required by the selected server distribution
- permit local firewall access
- create an initial server admin account if it cannot be automated

Do not invent manual steps.

Automate everything that can be automated reliably.

When blocked by a genuinely interactive prerequisite:

1. Stop only the affected slice.
2. Print exact manual instructions.
3. Explain how to verify completion.
4. Continue all other unblocked work.
5. Do not mark the entire initiative complete.

# Platform support

The primary developer platform is Windows.

Prefer scripts that work through npm and Node.js rather than requiring Bash-specific behavior.

Where shell scripts are unavoidable, provide PowerShell equivalents or use cross-platform Node scripts.

Paths must work on Windows.

Do not assume WSL unless explicitly selected and documented.

# Documentation

Create documentation such as:

docs/private-testing/README.md
docs/private-testing/architecture.md
docs/private-testing/scenarios.md
docs/private-testing/troubleshooting.md
docs/private-testing/manual-prerequisites.md

Include:

- architecture
- installation
- startup
- shutdown
- reset
- deployment
- scenario execution
- debugging failed scenarios
- adding a new scenario
- environment variables
- safety protections
- known limitations

Keep documentation aligned with actual commands.

# Verification

At the end of each slice, run relevant verification.

At initiative completion, run repository equivalents of:

npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run verify
npm run test:screeps-smoke
npm run test:combat

If a command cannot run because of an external prerequisite, state that precisely and provide the next manual action.

Do not report a private-server scenario as passed unless it ran against a real private server.

# Deployment restrictions

- Do not deploy to the official Screeps world.
- Do not push unless explicitly instructed.
- Do not modify production credentials.
- Do not activate an official-world branch.
- Do not use the browser editor.
- Do not modify protected production CI/CD behavior without necessity and tests.
- Local private-server deployment is allowed.
- Local test-user and world creation are allowed.

# Completion criteria

The initiative is complete when:

1. A new developer can follow documented prerequisites.
2. One command starts the private server.
3. One command resets and seeds the baseline world.
4. One command deploys the current bot locally.
5. Named combat scenarios can be run deterministically.
6. Scenario outcomes are automatically asserted.
7. A machine-readable and human-readable report is produced.
8. Failure exits nonzero and preserves useful diagnostics.
9. Destructive commands cannot target the official world.
10. The full combat suite runs using one command.
11. Existing gameplay tests still pass.
12. No official-world deployment occurred.

# Required final report

The final report must include:

- initiative decomposition
- slices completed
- slices blocked
- manual prerequisites still required
- architecture implemented
- commands added
- files changed
- scenarios implemented
- assertions implemented
- harness tests added
- real private-server tests actually executed
- test and coverage results
- known limitations
- troubleshooting notes
- confirmation that no official-world deployment occurred
- recommended next improvement without implementing it

Do not hide incomplete integration behind unit-test success.

If Codex context becomes constrained, stop at a clean slice boundary, commit or report the completed slice, and provide the exact next-slice prompt rather than continuing with degraded context.