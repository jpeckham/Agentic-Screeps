Stop the current broad implementation goal.

We are narrowing the work to Slice 1: Bootstrap Economy.

Do not implement construction planning, tower behavior, strategy selection, doctrine, remote mining, advanced telemetry, combat, or new architecture during this task.

First, preserve the current working state in Git. Do not deploy any further changes while performing this audit unless I explicitly authorize it.

## Slice 1 outcome

A single owned Screeps room must autonomously:

1. Discover itself without a hardcoded room name.
2. Initialize its memory without deleting unrelated memory.
3. Recover from having zero creeps when the spawn has at least 200 energy.
4. Spawn a minimal functional worker:
   [WORK, CARRY, MOVE]
5. Harvest energy from a source.
6. Return energy to the spawn and extensions.
7. Maintain a small, bounded worker population.
8. Upgrade the controller when spawn and extension demand is satisfied.
9. Replace expiring critical workers before total workforce loss.
10. Clean memory for dead creeps.
11. Continue operating after a global reset or new code deployment.
12. Emit concise status telemetry without logging every tick.
13. Remain protected by the existing runtime error boundary and survival loop.

## Audit first

Before modifying gameplay behavior:

1. Inspect the current implementation.
2. Map every Slice 1 requirement to one of:
   - complete and tested
   - complete but untested
   - partially complete
   - missing
   - defective
3. Review the live console evidence already available:
   - colony discovered automatically
   - workers spawned
   - harvesting occurred
   - spawn and extensions reached full energy
   - controller reached RCL 2
   - workforce recovered after dropping below target
4. Identify why the worker count sometimes exceeded the target and determine whether that was:
   - intentional TTL replacement
   - duplicate replacement
   - stale reservation state
   - another defect
5. Identify why the colony previously remained below its workforce target while energy was full.
6. Produce `docs/bootstrap-economy-audit.md`.

Do not add new features during the audit.

## Implementation scope

After the audit, implement only the smallest changes required to complete Slice 1.

Preserve the existing repository structure unless a narrow refactor is necessary.

Keep decision logic testable and separate from Screeps globals where practical.

## Required behaviors

### Emergency bootstrap

Given:
- one owned spawn
- no viable creeps
- at least 200 available room energy

Then:
- emergency mode is entered
- one [WORK, CARRY, MOVE] worker is requested immediately
- the AI does not wait for a larger body
- only one emergency worker request is active
- the worker harvests and returns energy
- the normal workforce is rebuilt
- emergency mode clears

Document that a spawn with less than 200 energy and no living creeps cannot recover autonomously.

### Normal workforce

The colony should maintain a conservative target such as 3–4 general workers during early RCL levels.

The planner must:
- count living viable workers
- account for creeps currently spawning
- account for explicitly reserved replacements
- not spawn unbounded workers
- not repeatedly request the same replacement
- permit a temporary count above target when an old creep and its replacement overlap

### Worker behavior

A worker with no useful energy should:
- withdraw from a suitable energy store when available
- otherwise harvest from a valid source

A worker carrying energy should prioritize:
1. spawn
2. extensions
3. controller upgrading

Construction and repair are outside this slice and must not be added or expanded.

Workers must:
- avoid changing mode every tick
- recover from missing targets
- reacquire useful work
- avoid standing idle while valid work exists

### Controller progression

When spawn and extensions are filled and the colony is not in emergency mode:
- one or more workers should upgrade the controller
- controller progress should continue over time
- upgrading may pause temporarily for workforce recovery or refilling

### Replacement behavior

For critical workers:
- estimate replacement need using TTL, spawn time, travel allowance, and safety margin
- request replacement before expiry
- avoid duplicate replacement requests
- clear stale replacement reservations
- minimize harvesting interruption

### Memory cleanup

Remove memory belonging to dead creeps.
Retain active creep memory.
Do not delete unrelated top-level Memory fields.

### Runtime safety

One creep failure must not prevent other creeps from running.
A colony failure must still fall through the existing top-level survival behavior.
Do not weaken the current CI/CD or runtime safety harness.

## Required tests

Add or verify tests for:

1. No creeps + 200 energy requests one emergency worker.
2. Emergency worker body is exactly functional and affordable.
3. Emergency mode does not wait for maximum room energy.
4. Empty worker harvests.
5. Loaded worker refills spawn before upgrading.
6. Worker refills extensions before upgrading.
7. Worker upgrades when energy structures are full.
8. Invalid target is cleared and reassigned.
9. Workforce does not grow indefinitely.
10. Spawning creeps are included in workforce accounting.
11. Replacement overlap can temporarily exceed target.
12. Duplicate replacement requests are prevented.
13. Stale replacement reservation is cleared.
14. Expiring critical worker triggers an early replacement.
15. Dead creep memory is removed.
16. Existing unrelated memory remains intact.
17. One creep exception does not stop other creeps.
18. Global reset does not lose required persistent state.

Add a deterministic multi-tick test:

Given:
- one owned spawn
- two sources
- 300 energy
- no creeps

Expected sequence:
- spawn bootstrap worker
- worker harvests
- worker refills spawn
- additional bounded workers are spawned
- controller is upgraded
- no emergency remains active

## Commands

Run:

npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run verify

Use the repository's equivalent commands if names differ.

## Deployment restriction

Do not deploy during this task.

Do not activate a Screeps branch.
Do not edit code in the Screeps browser editor.
Do not use the production token.

## Definition of done

Slice 1 is complete when:

- every requirement is classified in the audit
- missing or defective Slice 1 behavior is corrected
- all required tests pass
- no new out-of-scope features are introduced
- the live deployment process remains unchanged
- Codex stops after reporting results

Final response must include:

1. Current Slice 1 completion status.
2. Defects found.
3. Changes made.
4. Files changed.
5. Tests added or updated.
6. Commands run and results.
7. Behaviors that still require live observation.
8. Confirmation that no deployment occurred.
9. Recommended next slice, but do not implement it.