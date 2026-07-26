# Bootstrap Economy Audit

Scope source: `docs/prompts/2026-07-25 Autonomous Colony Slice 1.md`

Audit date: 2026-07-25

This audit narrows the current codebase to Slice 1: Bootstrap Economy. The repository currently contains later-slice behavior from the broader colony implementation, including construction planning, tower behavior, strategy selection, and richer visuals. Those features are not expanded by this audit and should not be used as proof of Slice 1 completion unless they directly support bootstrap economy behavior.

## Current State

- Current local HEAD at audit start: `0d62750 docs: add bootstrap economy slice prompt`.
- Previous pushed runtime commit before this audit: `31b7715 fix: format room status output`.
- Audit reply prompt preserved locally in `b631c75 docs: add slice 1 audit reply prompt`.
- No additional deployment is authorized for this Slice 1 task.
- CI/CD still deploys pushed commits to the Screeps `default` branch through `.github/workflows/ci-cd.yml`; this audit does not change that pipeline.

## Slice 1 Requirement Map

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| 1. Discover owned room without hardcoded name | Complete and tested | `runOwnedColonies` iterates `game.rooms` and checks `room.controller?.my`; tests cover owned-room execution. | `runColony` also has a fallback `firstOwnedRoomName`. |
| 2. Initialize memory without deleting unrelated memory | Complete and tested | `ensureColonyMemory` only initializes `memory.colonies[roomName]`; cleanup test preserves unrelated memory; migration test preserves unrelated fields while applying root defaults. | Root migrations can resume across ticks under the current CPU budget. |
| 3. Recover from zero creeps when spawn has at least 200 energy | Complete and tested | `planWorkforce` enters emergency at `workerCount === 0`; emergency scenarios spawn `[work, carry, move]`. | Unavoidable limitation below 200 energy is documented in `docs/autonomous-colony.md`. |
| 4. Spawn minimal functional worker `[WORK,CARRY,MOVE]` | Complete and tested | `buildWorkerBody(200, 300)` and emergency plan tests assert the body. | Uses string constants in tests and Screeps constants at runtime. |
| 5. Harvest energy from a source | Complete and tested | `runWorker` calls `harvest` when acquiring and no storage is available; fresh RCL1 tests cover harvest. | Source balancing exists but is beyond Slice 1 proof. |
| 6. Return energy to spawn and extensions | Complete and tested | `findRefillTarget` prioritizes spawn then extension; tests cover spawn refill and direct extension refill before upgrade. |  |
| 7. Maintain small, bounded worker population | Complete and tested | `desiredWorkerCount` caps workers through strategy/default max; replacement overlap test exists; normal, emergency, and replacement workers currently being spawned now count as reserved workforce. | Current strategy/construction pressure can raise targets above the Slice 1 3-4 worker baseline because later-slice strategy code already exists. |
| 8. Upgrade controller when spawn/extension demand is satisfied | Complete and tested | `performWork` upgrades after refill demand is gone; tests cover upgrade when priorities are satisfied. | Current broader implementation can choose build/repair before normal upgrade when sites/repairs exist, which is outside Slice 1. |
| 9. Replace expiring critical workers before total loss | Complete and tested | `replacementTtlThreshold`, `replacing` tags, replacement scenario tests, and current-spawning replacement tests cover this. | Legitimate overlap remains allowed; duplicate replacement requests are suppressed by visible and spawning replacement metadata. |
| 10. Clean memory for dead creeps | Complete and tested | `cleanupDeadCreepMemory` removes absent creep keys and preserves active/unrelated memory. | Called from `runNormalEmpireLoop`. |
| 11. Continue after global reset or new code deployment | Complete and tested | Migrations are idempotent; runtime release-state tests cover new release activation; colony memory is durable; reset-like rerun test preserves existing colony memory. | No live reset was performed during this audit. |
| 12. Emit concise status telemetry without logging every tick | Complete and tested | `maybeLogStatus` is interval-gated; test asserts no log before interval and one status line at interval. | Lifecycle and strategy logs are state-change based. |
| 13. Remain protected by runtime error boundary and survival loop | Complete and tested | `createLoop` catches top-level failures and invokes survival loop; tests cover survival fallback. | Per-creep failures are caught in `runColony`. |

## Required Test Map

| Required test | Status | Evidence |
| --- | --- | --- |
| 1. No creeps + 200 energy requests one emergency worker | Covered | `requests emergency bootstrap without waiting for max energy`; fresh RCL1 and emergency scenario tests. |
| 2. Emergency worker body exactly functional and affordable | Covered | Body-builder and emergency spawn assertions. |
| 3. Emergency mode does not wait for max room energy | Covered | `energyAvailable: 200`, `energyCapacityAvailable: 300` test. |
| 4. Empty worker harvests | Covered | Fresh RCL1 and emergency worker harvest tests. |
| 5. Loaded worker refills spawn before upgrading | Covered | Fresh RCL1 and refill-priority tests. |
| 6. Worker refills extensions before upgrading | Covered | Direct `refills extensions before upgrading` test. |
| 7. Worker upgrades when energy structures are full | Covered | `upgrades when refill, build, and repair priorities are satisfied`. |
| 8. Invalid target is cleared and reassigned | Covered | `clears invalid work assignments when targets no longer need energy`. |
| 9. Workforce does not grow indefinitely | Covered | Workforce bounded replacement test. |
| 10. Spawning creeps are included in workforce accounting | Covered | Added failing planner tests for normal, emergency, and replacement reservations; production planner now accepts `spawningWorkerCount` and `spawningReplacementCount`, and controller passes active `spawn.spawning` reservations from pending creep name and memory. |
| 11. Replacement overlap can temporarily exceed target | Covered | Replacement overlap scenario permits old and replacement to coexist without duplicate spawn. |
| 12. Duplicate replacement requests are prevented | Covered | Existing `replacing` tag tests plus currently-spawning replacement test. |
| 13. Stale replacement reservation is cleared | Covered | Stale replacement markers for non-expiring dead names are ignored; no persistent reservation state exists, so there is nothing durable to clear. |
| 14. Expiring critical worker triggers early replacement | Covered | `tags expiring worker replacements...` and Scenario E. |
| 15. Dead creep memory is removed | Covered | `cleans only dead creep memory...`. |
| 16. Existing unrelated memory remains intact | Covered | Cleanup test plus direct migration preservation test. |
| 17. One creep exception does not stop other creeps | Covered | `one creep action failure does not stop other creeps from running`. |
| 18. Global reset does not lose required persistent state | Covered | Migration/release-state tests plus reset-like `runOwnedColonies` rerun test preserving `initializedAt` and unrelated memory. |
| Deterministic multi-tick bootstrap scenario | Covered | Scenario A: fresh RCL1 room bootstraps, harvests, refills, spawns more workers, and upgrades. |

## Live Evidence Reviewed

Live evidence already observed in this thread:

- The deployed main module began with a release header like `/* release-122635b6 ... */`, proving the Screeps default branch received built code.
- A later live check confirmed `release-b0fa3802` was active.
- Live memory/status evidence showed the owned room discovered and holding a colony strategy of `balanced-early`.
- User-observed game state confirmed spawned workers, harvest/refill behavior, full spawn/extensions, and RCL 2 reached.
- User observed workforce recovering after it dropped below target.

Not yet proven live for Slice 1:

- A controlled zero-creep emergency recovery in the live room.
- Direct live proof that a currently spawning creep suppresses duplicate workforce requests.
- Live proof that global reset/new deployment preserves required colony state beyond automated test evidence.

## Worker Count Exceeding Target

Most likely cause: intentional TTL replacement overlap.

Evidence:

- `runColony` treats workers below `replacementTtlThreshold` as expiring.
- When an expiring worker has no visible replacement tagged with `memory.replacing`, a new worker spawn request is tagged with `replacing: <old creep name>`.
- The old creep and replacement can coexist temporarily, so visible worker count may exceed `workforceTarget`.

Secondary risk found during audit and fixed:

- Workforce accounting did not explicitly count `spawn.spawning` as a reserved worker. If the spawning creep was not present in `FIND_MY_CREEPS` yet, the planner could see the room as still short.
- The controller now reads `spawn.spawning.name`, looks up that creep in `Game.creeps`, excludes workers already visible in the room snapshot, and passes pending worker/replacement counts into `planWorkforce`.

Conclusion:

- A temporary count over target is expected during replacement overlap.
- Duplicate normal, emergency, and replacement requests from missing spawn-reservation accounting are now covered by failing-then-passing planner tests and controller reservation wiring.

## Below Target While Energy Was Full

Likely causes, in priority order:

1. The spawn was already busy. `spawnFromPlan` skips all busy spawns via `!item.spawning`; room energy can remain full while a spawn is still producing.
2. Effective worker count may have included replacement tags, making the planner think demand was already reserved even when the visible worker count looked low.
3. Existing broader strategy logic may change target size based on context, so the observed target may not match the simple 3-4 Slice 1 baseline.
4. If `FIND_MY_CREEPS` omitted a currently spawning creep, the planner previously could see the room as short until the creep appeared. This is fixed by direct `spawn.spawning` reservation accounting.

No evidence currently points to body-building affordability when energy is full; `buildWorkerBody` returns a valid body when `energyAvailable >= 200`.

## Defects To Fix For Slice 1

1. Fixed: explicit workforce accounting for creeps currently being spawned.
   - This prevents duplicate normal, emergency, and replacement requests while the spawn already has a pending creep.
   - Implemented without a queue or broad architecture.

2. Fixed: direct tests added for Slice 1 worker priorities and persistence:
   - extension refill before upgrade
   - reset-like rerun preserves existing colony memory
   - migration preserves unrelated top-level memory while applying initialization defaults

3. Maintained: construction, tower, strategy, doctrine, and telemetry were not expanded while fixing Slice 1.

## Out Of Scope Already Present

These are already in the repository from the broader implementation and should not be expanded in this Slice 1 task:

- Strategy selection
- Construction planning
- Tower behavior
- RCL 3/RCL 4 infrastructure behavior
- Detailed assignment visuals beyond basic status

## Implemented Minimal Fix

1. Extend the tick-local snapshot or colony controller with a small helper that reads active `spawn.spawning` names/memory where available.
2. Count active spawning creeps as reserved workers for workforce planning.
3. Treat a spawning creep with `memory.replacing` or a pending spawned name matching the current replacement target as replacement demand.
4. Keep all new coverage in existing unit tests.
5. Run the full required command list before reporting Slice 1 status.
