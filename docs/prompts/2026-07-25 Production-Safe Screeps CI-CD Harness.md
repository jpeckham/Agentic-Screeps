# Goal: Build a Production-Safe Screeps CI/CD Harness

Build the CI/CD, deployment, testing, release-management, and runtime-safety harness for my Screeps AI.

The immediate priority is protecting my live Screeps empire from defective code. Do not build gameplay features, creep roles, colony logic, strategy engines, or combat behavior beyond the minimum stubs needed to prove the harness works.

## Primary outcome

I need a GitHub-based development workflow where:

- Git is the only source of truth.
- Pull requests cannot merge unless compilation, static analysis, and automated tests pass.
- Production code is never uploaded directly from a developer workstation.
- Every release is built once as an immutable artifact.
- Production deployment requires explicit approval.
- New code is uploaded to an inactive Screeps branch before activation.
- The previous known-good release remains available for immediate rollback.
- Runtime failures cannot completely disable harvesting, spawning, tower defense, or controller protection.
- Persistent Memory schema changes are versioned and safely migrated.
- Deployment and rollback procedures are documented and testable.

## First action

Before changing files:

- Inspect the existing repository.
- Identify the current language, build system, tests, bundler, package manager, entry point, module format, and deployment tooling.
- Preserve working conventions where practical.
- Produce a concise implementation plan.
- Then implement the plan without waiting for further approval.

If the repository is empty, initialize it as a TypeScript Screeps project using Node.js 22, npm, Vitest, ESLint, and Rollup or esbuild.

Do not introduce a large framework where a small implementation is sufficient.

## Required architecture

Create or adapt the repository toward this structure:

src/  
├── main.ts  
├── runtime/  
│ ├── build-info.ts  
│ ├── error-boundary.ts  
│ ├── health-monitor.ts  
│ ├── safe-mode.ts  
│ └── release-state.ts  
├── memory/  
│ ├── schema.ts  
│ ├── migrations.ts  
│ └── migration-runner.ts  
└── survival/  
└── survival-loop.ts  
<br/>test/  
├── unit/  
├── integration/  
└── fixtures/  
<br/>scripts/  
├── build-release.mjs  
├── deploy-screeps.mjs  
├── activate-branch.mjs  
├── rollback-screeps.mjs  
└── verify-release.mjs  
<br/>.github/  
└── workflows/  
├── pull-request.yml  
├── release-candidate.yml  
├── production-deploy.yml  
└── production-rollback.yml  
<br/>docs/  
├── cicd.md  
├── deployment.md  
├── rollback.md  
├── github-setup.md  
└── memory-migrations.md

Adapt this structure if the existing repository has equivalent boundaries.

## Technology requirements

Use:

- TypeScript with strict mode
- Node.js 22
- npm with a committed lock file
- Vitest for tests unless an established equivalent already exists
- ESLint
- A deterministic bundler such as Rollup or esbuild
- Native fetch for Screeps HTTP API calls
- GitHub Actions
- GitHub Environments for production approval

Avoid:

- Global npm dependencies
- Secrets in source code
- Username/password authentication
- Deploying from the browser editor
- Editing generated files manually
- Runtime eval
- Dynamic source generation
- Large dependency-injection containers
- Heavy enterprise abstractions

## Build requirements

Implement these npm commands:

npm run typecheck  
npm run lint  
npm run test  
npm run test:coverage  
npm run build  
npm run verify  
npm run deploy:candidate  
npm run deploy:production  
npm run rollback:production

npm run verify must run all checks required before deployment.

The build must:

- Clean the output directory.
- Compile TypeScript.
- Bundle code into Screeps-compatible JavaScript modules.
- Fail on TypeScript errors.
- Fail on lint errors.
- Fail on failing tests.
- Inject immutable build information:
  - full Git SHA
  - short Git SHA
  - build timestamp
  - repository version when available
- Generate a release manifest containing:
  - release identifier
  - Git SHA
  - build timestamp
  - module names
  - hashes of generated files
  - expected entry module
- Produce deterministic output where possible.
- Never include Screeps tokens or other secrets in the artifact.

Use a release identifier resembling:

release-&lt;short-git-sha&gt;

## Screeps deployment client

Implement a small, well-tested Screeps API client used by the deployment scripts.

Configuration must come from environment variables:

SCREEPS_TOKEN  
SCREEPS_HOST  
SCREEPS_BRANCH  
SCREEPS_SHARD

Use sensible defaults only for non-secret values.

The client must support:

- Uploading all generated JavaScript modules to a specified inactive Screeps branch.
- Reading branch metadata or uploaded code back when supported.
- Determining the currently active branch.
- Activating a specified branch.
- Recording the previously active branch before activation.
- Rolling back to the recorded previous branch.
- Clear handling for:
  - authentication failure
  - permission failure
  - malformed responses
  - rate limiting
  - server errors
  - network failures
  - partial upload failure

Never print the token.

Sanitize error output and request diagnostics.

Use an X-Token header.

Do not place the token in URLs, files, logs, build artifacts, or command-line arguments.

## Deployment-slot model

Use Screeps code branches as release slots.

Support these conceptual slots:

production-active  
production-candidate  
production-previous

Because Screeps branch naming and activation behavior may differ from this conceptual model, implement the safest practical equivalent.

The production process must be:

- Build the artifact once.
- Download that exact artifact in the deployment job.
- Upload it to a non-active release branch such as release-abc12345.
- Verify the uploaded release.
- Capture the currently active branch as the rollback target.
- Require GitHub Environment approval.
- Activate the release branch.
- Print a release summary.
- Preserve the prior branch.
- Never rebuild during the deployment job.

Do not upload directly over the active branch unless the Screeps API provides no safer alternative. If forced to do so, document the limitation prominently and create a backup branch first.

## Verification after upload

Before activation, verify:

- Every expected module exists.
- The expected entry module exists.
- Module count matches the manifest.
- Uploaded module hashes match when the API permits reading code back.
- The release identifier is embedded in the generated code.
- The branch is not currently active.
- No source maps, test fixtures, secrets, or TypeScript source files are being uploaded.

Fail closed. Do not activate an unverifiable candidate.

## GitHub Actions workflows

### Pull request workflow

Create .github/workflows/pull-request.yml.

Trigger on pull requests.

It must:

- Check out the repository.
- Install Node.js 22.
- Use npm ci.
- Run type checking.
- Run linting.
- Run unit tests.
- Run test coverage.
- Run the production build.
- Validate the release manifest.
- Upload the build artifact for inspection.
- Use least-privilege permissions.
- Use concurrency cancellation for superseded PR runs.

No Screeps token should be available to this workflow.

### Release candidate workflow

Create .github/workflows/release-candidate.yml.

Trigger on push to main and optionally through manual dispatch.

It must:

- Run the full verification suite.
- Build once.
- Upload the immutable artifact to GitHub Actions.
- Optionally upload it to an inactive Screeps candidate branch.
- Never activate production.
- Produce a clear summary containing the release identifier and candidate branch.

Use a separate GitHub Environment or secret scope for candidate deployment.

### Production deployment workflow

Create .github/workflows/production-deploy.yml.

Trigger only through workflow_dispatch.

Inputs should include:

release identifier or artifact run  
target Screeps branch  
confirmation value

The workflow must:

- Use the protected screeps-production GitHub Environment.
- Require manual approval through environment protection rules.
- Download an existing immutable artifact.
- Verify its manifest and hashes.
- Upload to an inactive release branch if not already uploaded.
- Verify the remote candidate.
- Capture the current active branch.
- Activate the new branch.
- Store rollback metadata as a workflow artifact.
- Write a deployment summary.
- Refuse deployment from an untrusted fork or pull request context.
- Prevent concurrent production deployments.

Require a confirmation input such as:

DEPLOY

Fail if the confirmation does not match exactly.

### Production rollback workflow

Create .github/workflows/production-rollback.yml.

Trigger only through workflow_dispatch.

It must:

- Use the protected production environment.
- Require confirmation such as ROLLBACK.
- Accept an explicit target branch.
- Display the currently active branch.
- Verify the rollback target exists.
- Activate the target.
- Produce a rollback summary.
- Never guess a rollback target silently.
- Prevent concurrent deployment and rollback jobs.

## Runtime protection

Implement a small runtime safety layer.

The exported Screeps loop must never consist of one unprotected call.

Use a structure resembling:

export function loop(): void {  
beginTick();  
<br/>try {  
runNormalEmpireLoop();  
recordHealthyTick();  
} catch (error) {  
recordTopLevelFailure(error);  
runSurvivalLoop();  
} finally {  
endTick();  
}  
}

Do not swallow errors silently.

### Error boundaries

Provide fault isolation around independent subsystems or processes:

runSafely("colony:W1N1", () => runColony(...));

One colony, creep, operation, or planner failure must not automatically prevent all remaining critical work.

Capture compact error information:

- build version
- game tick
- process or subsystem name
- error message
- shortened stack trace
- consecutive failure count
- last successful tick

Keep bounded error history. Do not let error logging grow indefinitely.

### Survival loop

Create a minimal survival loop that attempts only critical operations:

- Run tower attack, healing, and repair behavior when available.
- Ensure at least one basic energy-harvesting creep can exist.
- Spawn an emergency harvester when there are no viable harvesters.
- Keep critical spawn and extension energy supplied where possible.
- Upgrade the controller enough to prevent downgrade when possible.
- Do not perform:
  - expansion
  - offensive operations
  - market speculation
  - expensive strategic planning
  - large path recalculations
  - nonessential construction planning

The survival loop must be deliberately small and independently testable.

Do not assume a particular existing colony architecture. Introduce adapters or hooks where necessary.

### Runtime release state

Persist compact release-health information:

interface ReleaseState {  
version: string;  
activatedAt: number;  
lastHealthyTick: number;  
healthyTicks: number;  
consecutiveTopLevelFailures: number;  
degradedMode: boolean;  
}

The runtime must:

- detect when the deployed build version changes
- initialize health state for a new release
- track consecutive failures
- enter degraded mode after a configurable threshold
- leave degraded mode only after a configurable number of healthy ticks
- expose status through logs
- avoid automatically changing Screeps code branches from inside game code

Branch rollback belongs to CI/CD, not the game runtime.

## Memory schema and migrations

Create an explicit root memory schema with a version number.

Example:

interface RootMemory {  
schemaVersion: number;  
runtime: RuntimeMemory;  
}

Implement:

- migration registration
- migration ordering
- idempotent migrations
- incremental migration support
- bounded CPU use per tick
- migration failure recording
- compatibility with partially migrated state
- unit tests for every migration

Use an expand-and-contract approach:

- Add new fields.
- Deploy code that supports old and new forms.
- Migrate incrementally.
- Observe.
- Remove obsolete fields only in a later release.

Never make the initial harness migration destructive.

## Testing requirements

Follow test-driven development.

For every meaningful behavior:

- Write or update a failing test.
- Implement the minimum behavior.
- Refactor while tests remain green.

Required tests include:

### Deployment tests

- Builds module payload from output files.
- Rejects non-JavaScript files.
- Rejects an empty build.
- Rejects a missing entry module.
- Does not expose the token in errors.
- Uploads to the requested branch.
- Does not activate during candidate deployment.
- Records the previous active branch.
- Refuses to activate an unverified release.
- Rejects malformed API responses.
- Handles HTTP 401, 403, 429, and 500 responses.
- Rollback activates only the explicitly selected branch.

Mock network calls. Do not call the live Screeps API during normal tests.

### Manifest tests

- Produces stable module ordering.
- Includes hashes for all modules.
- Detects artifact tampering.
- Includes Git SHA and build timestamp.
- Excludes secrets and source files.

### Runtime tests

- Normal loop records healthy ticks.
- Top-level failure invokes the survival loop.
- One subsystem failure does not stop unrelated subsystems.
- Repeated failures enable degraded mode.
- Healthy ticks eventually clear degraded mode.
- Error history is bounded.
- New release detection resets appropriate counters.
- Survival loop does not invoke strategic or offensive behavior.

### Migration tests

- Empty memory initializes safely.
- Migrations run in order.
- Already-applied migrations do not rerun destructively.
- Migration failure leaves recoverable state.
- Large migrations can resume on the next tick.

## Testability constraints

Keep pure logic separate from Screeps globals.

Prefer functions that accept explicit inputs:

selectRuntimeMode(state, config)  
buildModulePayload(files)  
verifyManifest(manifest, files)  
determineRollbackTarget(activeBranch, recordedPreviousBranch)

Wrap Screeps globals and HTTP access at narrow boundaries.

Do not make unit tests depend on a full Screeps server.

## Security requirements

- Use minimum GitHub Actions permissions.
- Pin third-party GitHub Actions to immutable commit SHAs where practical.
- Document any actions that remain version-tag pinned.
- Never expose production secrets to pull request workflows.
- Never run secret-bearing workflows for forks.
- Use GitHub Environment-scoped secrets.
- Recommend a narrowly scoped Screeps token.
- Add secret scanning guidance.
- Add .gitignore entries for local environment files.
- Provide .env.example containing names only, never values.
- Prevent verbose HTTP logging from printing authorization headers.
- Validate all workflow-dispatch inputs.

## Documentation requirements

Create concise but complete documentation.

### docs/github-setup.md

Explain:

- repository secrets
- GitHub Environments
- required reviewers
- branch protection
- required status checks
- workflow permissions
- concurrency protection
- how to create and scope the Screeps token

### docs/cicd.md

Explain:

- source-of-truth policy
- pull request flow
- build-once/deploy-many approach
- artifact contents
- release naming
- environment boundaries

### docs/deployment.md

Explain the exact production deployment steps.

### docs/rollback.md

Explain:

- how to identify the active release
- how to choose the previous known-good branch
- how to invoke rollback
- how to verify rollback
- what to do when memory schema compatibility prevents rollback

### docs/memory-migrations.md

Explain the migration contract and expand-and-contract process.

## Developer experience

Provide clear command output.

Examples:

✓ TypeScript compilation passed  
✓ 42 tests passed  
✓ Release manifest verified  
✓ Uploaded 18 modules to release-a1b2c3d4  
✓ Remote candidate verified  
✓ Previous active branch: release-99887766  
✓ Activated release-a1b2c3d4

Errors must be actionable:

Deployment refused: expected entry module "main" was not present.

Do not produce enormous logs.

## Definition of done

The task is complete when:

- A fresh clone can run npm ci && npm run verify.
- Pull requests execute all quality gates without access to production secrets.
- A release artifact is generated with a verifiable manifest.
- A candidate can be uploaded without activating it.
- Production activation requires explicit workflow dispatch and environment approval.
- Rollback can activate a specified prior branch.
- Runtime exceptions fall back to a tested survival loop.
- Memory schema changes are versioned and migration-tested.
- Documentation explains GitHub and Screeps setup.
- All tests pass.
- No live production deployment is performed during implementation.
- The final response lists:
  - files added or modified
  - architecture decisions
  - commands run
  - tests and results
  - GitHub configuration I must perform manually
  - Screeps secrets I must configure
  - remaining risks or limitations

## Important constraints

- Do not deploy to my live Screeps account.
- Do not request or store my Screeps token.
- Do not overwrite existing gameplay logic unnecessarily.
- Do not build the advanced strategic architecture yet.
- Do not claim remote verification occurred unless it actually did.
- Do not leave placeholder implementations for production-critical behavior.
- Make reasonable assumptions and document them.
- Prefer a narrow, complete safety harness over a broad unfinished platform.