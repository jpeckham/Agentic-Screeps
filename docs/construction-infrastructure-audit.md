# Construction and Early Infrastructure Audit

Scope source: `docs/prompts/2026-07-25 slice 2 Construction and Early Infrastructure.md`

Audit date: 2026-07-25

This audit covers Slice 2 only: construction and early infrastructure behavior
for one owned Screeps room from RCL 2 through early RCL 4. Slice 1 Bootstrap
Economy remains the foundation and is not redefined here.

## Current State

- `src/construction/construction-planner.ts` owns incremental construction
  planning and returns at most one site plan per planning pass.
- `src/colony/colony-controller.ts` runs construction only when the colony is not
  in emergency mode and CPU bucket is at or above `lowCpuBucket`.
- `src/creeps/creep-runner.ts` already includes construction, tower refill,
  downgrade prevention, upgrade, and bounded repair priorities.
- `src/structures/tower-controller.ts` attacks hostiles, heals friendlies, and
  repairs when above reserve.
- Existing tests already cover many broader autonomous-colony behaviors,
  including RCL 2 extension planning, RCL 3 tower planning, worker build
  priority, tower reserve, and deterministic RCL transition scenarios.
- The Slice 2 prompt file is currently untracked in Git along with this audit
  and the implementation plan.
- Targeted RED testing found two real Slice 2 defects:
  - RCL 4 storage could be planned before source containers covered the room's
    sources.
  - `runTower` could repair walls or ramparts if passed those targets directly.

## Slice 2 Requirement Map

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| 1. Plan extensions after reaching RCL 2 | Complete and tested | `desiredStructure` returns extensions at RCL 2; tests include `plans extensions at RCL2...` and Scenario C. |  |
| 2. Build planned extensions without starving refill or controller progress | Complete and tested | `findRefillTarget` precedes build work; tests cover spawn/extension refill, extension build, and controller progress while extension builders are saturated. |  |
| 3. Use extension capacity for stronger workers | Complete and tested | `buildWorkerBody` scales with energy; Scenario C asserts a larger body after 550 capacity. |  |
| 4. Plan first tower after RCL 3 | Complete and tested | `desiredStructure` returns tower at RCL 3 when no tower/site exists; tests include RCL3 planner and Scenario D. |  |
| 5. Prioritize first tower over lower-priority construction | Complete and tested | `findBuildTarget` critical priorities put tower before extension; Scenario D asserts tower build over extension site. |  |
| 6. Refill tower to reserve | Complete and tested | `needsEnergy` uses `towerEnergyReserve`; tests cover configured tower reserve. |  |
| 7. Keep tower behavior defensive and bounded | Complete and tested | Tower attacks and heals before repair, repairs only above reserve, and now ignores wall/rampart targets directly. |  |
| 8. Plan source containers only when useful and available | Complete and tested | Containers are gated to RCL >= 3 and source-near checks; tests cover RCL3 container placement. |  |
| 9. Limited roads only when justified, otherwise deferred | Complete by deferral | Construction strategy has no road kind; prompt allows deferral. | Roads remain deferred. |
| 10. Plan early RCL4 storage only after lower-RCL infrastructure | Complete and tested | Added direct failing-then-passing test that missing source containers force container planning before storage; existing positive test now uses containers adjacent to both sources before expecting storage. |  |
| 11. Avoid duplicate, invalid, source-blocking, controller-blocking, or wall sites | Complete and tested | Tests cover duplicates, walls, source access, spawn access, and source-blocking site removal; controller access is covered by the same `preservesCriticalAccess` path that protects sources/spawns. |  |
| 12. Keep planning incremental | Complete and tested | `planConstruction` returns one plan per pass and cadence test covers planning cadence. |  |
| 13. Preserve Slice 1 survival under construction pressure | Complete and tested | Emergency suppresses construction in Scenario B; low-CPU test shows workers still run while construction/visuals are suppressed; Slice 1 tests still exist. |  |

## Required Test Map

| Required test | Status | Evidence |
| --- | --- | --- |
| 1. RCL 1 does not place construction | Covered | Added direct `does not place construction at RCL1` test. |
| 2. RCL 2 places extension sites | Covered | `plans extensions at RCL2...`; Scenario C. |
| 3. RCL 2 does not exceed 5 extensions/sites | Covered | Added direct RCL2 extension-limit/unavailable-infrastructure test. |
| 4. RCL 3 places tower | Covered | `plans extensions at RCL2...`; Scenario D. |
| 5. RCL 3 does not place duplicate tower sites | Covered | `hasStructureOrSite` includes tower sites; existing combined test covers no duplicate planning. |
| 6. RCL 3 can plan additional extensions up to limit | Covered | Added direct RCL3 additional-extension test. |
| 7. Early RCL4 storage prerequisites | Covered | Added direct missing-container test and fixed planner to gate storage on source-container coverage. |
| 8. Does not place unavailable structure types | Covered | Added direct RCL2 test proving no tower/container/storage plan after the RCL2 extension cap is reached. |
| 9. Does not place on walls | Covered | `does not place construction on duplicate occupied positions or walls`. |
| 10. Does not place duplicate occupied positions | Covered | Same test. |
| 11. Preserves source access | Covered | Source access and choke tests. |
| 12. Preserves controller access | Covered | Added direct `does not consume the last open controller access tile` test. |
| 13. Preserves spawn access | Covered | Added direct `does not consume the last open spawn access tile` test. |
| 14. Removes or replans source-blocking sites | Covered | Two source-blocking removal tests. |
| 15. Planning cadence | Covered | Cadence/force replan test. |
| 16. `forceReplan` bypasses once and clears | Covered | Cadence test checks bypass; planner clears `forceReplan`. |
| 17. Emergency suppresses construction planning | Covered | Scenario B asserts no construction in emergency. |
| 18. Low CPU suppresses construction and visuals without breaking execution | Covered | Added direct low-CPU test; worker execution still runs. |
| 19. Worker refills tower before noncritical construction | Covered | Added direct tower-refill-before-container-build test. |
| 20. Worker builds tower before lower-priority sites | Covered | Scenario D. |
| 21. Worker builds extensions before lower-priority sites | Covered | Added direct extension-before-container build test. |
| 22. Saturated critical build does not starve controller | Covered | Extension and tower saturation tests. |
| 23. Completed or invalid build targets cleared/reassigned | Covered | Added direct stale-build-assignment test; worker selects the current site and overwrites the old target id. |
| 24. Construction demand raises bounded workforce | Covered | Strategy/workforce tests and `desiredWorkerCount` caps. |
| 25. Higher capacity produces stronger bodies | Covered | Body-builder tests and Scenario C. |
| 26. Tower attacks hostile before repair | Covered | Tower tests and Scenario D. |
| 27. Tower heals before repair | Covered | Tower tests and colony snapshot tower test. |
| 28. Tower preserves reserve | Covered | Tower reserve tests. |
| 29. Wall/rampart repair bounded or deferred | Covered | Added direct tower-controller test; tower repair now ignores walls/ramparts. |
| 30. Construction memory survives reset/release | Covered | Added direct reset-like owned-room execution test preserving `lastConstructionPlan` and unrelated memory. |
| Scenario C: RCL2 infrastructure | Covered | Existing Scenario C. |
| Scenario D: RCL3 tower | Covered | Existing Scenario D. |

## Later-Slice Behavior Already Present

- Strategy selection profiles beyond Slice 2.
- RCL 4 storage planning.
- Source container planning.
- Tower healing and repair.
- Room visuals with strategy and assignment counts.
- Bounded repair behavior for roads, walls, and ramparts.

These behaviors should not be expanded except where the Slice 2 prompt directly
requires verification or a narrow defect fix.

## Construction Planning Findings

- RCL availability is implemented through explicit RCL gates in
  `desiredStructure`.
- Existing structures and sites are counted for extensions, tower, containers,
  and storage.
- The planner returns one plan per pass and respects `lastPlanTick`, cadence,
  and `forceReplan`.
- `runColony` suppresses planning in emergency and below `lowCpuBucket`.
- `isBuildable` rejects wall tiles, occupied positions, and non-container sites
  on source reserve tiles.
- `preservesCriticalAccess` checks sources, spawns, and the controller, but
  spawn/controller preservation need direct tests in the final evidence map.
- `removeSourceBlockingConstruction` removes non-container sites on source
  reserve tiles before planning and sets `forceReplan` through controller wiring.
- Current strategy priority is `tower`, `extension`, `storage`, `container`.
  The storage branch now explicitly skips storage while any source still needs a
  nearby container, so RCL4 storage no longer leapfrogs missing source
  containers.

## Worker Priority Findings

- Worker refill priority is spawn, extension, then tower below reserve.
- Critical build priority is tower then extension.
- Controller downgrade prevention is before normal build, with a special case
  that allows nearby critical construction first.
- Saturated critical construction allows additional workers to upgrade.
- Normal construction is before normal upgrade; this is acceptable only because
  critical saturation and bounded workforce tests preserve controller progress.
- Repairs are bounded by type and thresholds; workers only consider
  walls/ramparts below the wall starter threshold, and towers now ignore
  walls/ramparts directly.

## Defects To Fix For Slice 2

1. Fixed: missing direct test for no construction at RCL 1.
2. Fixed: missing direct test for spawn-access preservation.
3. Fixed: missing direct test for low-CPU suppression of construction and visuals
   while workers still run.
4. Fixed: RCL4 storage could be planned before source containers because storage
   precedes container in construction priority. Storage now waits until all
   sources have nearby container structure/site coverage.
5. Fixed: direct `runTower` calls could repair walls/ramparts. Tower repair now
   filters those structure types out before choosing a repair target.

## Implemented Minimal Fix

1. Added focused Slice 2 tests in `test/unit/autonomous-colony.test.ts` for:
   - no RCL1 construction
   - RCL2 extension cap and unavailable infrastructure suppression
   - RCL3 additional extension planning
   - spawn-access preservation
   - controller-access preservation
   - RCL4 storage waiting for source containers
   - tower refill before noncritical construction
   - extension build priority before lower-priority construction
   - stale build assignment reassignment
   - tower wall/rampart repair exclusion
   - low-CPU construction/visual suppression while workers still run
   - construction plan memory preservation across reset-like execution
2. Updated `src/construction/construction-planner.ts` so RCL4 storage is skipped
   while `sourceNeedingContainer` finds an unserved source.
3. Updated `src/structures/tower-controller.ts` so tower repair ignores
   `constructedWall` and `rampart` targets directly.
4. Corrected the existing positive RCL4 storage test fixture so its container
   structures are adjacent to the room's two default sources.

## Verification Results

- RED targeted test run failed as expected for:
  - `does not plan RCL4 storage before source containers are present or planned`
  - `tower does not repair walls or ramparts`
- GREEN targeted test run passed: 5 tests passed.
- Additional direct coverage run passed: 7 tests passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 8 test files, 115 tests.
- `npm run test:coverage` passed: 8 test files, 115 tests; total coverage
  reported 90.89% statements and 80.59% branches.
- `npm run build` passed and generated `release-2b4d8ae6`.
- `npm run verify` passed: typecheck, lint, coverage, build, and release
  manifest verification all completed successfully.
- No deployment command was run.

## Live Evidence Still Required

- RCL 2 extension sites appearing in the live room.
- Extension completion and stronger worker bodies appearing after capacity grows.
- RCL 3 tower site appearing live.
- Tower refill to reserve and hostile attack behavior live.
- CPU bucket gating behavior live.
- Confirmation that no construction site spam occurs over extended live runtime.
