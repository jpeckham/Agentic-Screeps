# Slice 2: Construction and Early Infrastructure

Complete the next autonomous-colony slice by auditing and hardening construction
and early infrastructure behavior only.

Slice 1 Bootstrap Economy is complete in `docs/bootstrap-economy-audit.md`.
Preserve that behavior. Do not regress emergency recovery, worker replacement,
memory preservation, runtime safety, or CI/CD.

Do not deploy during this task.

## Scope

This slice covers a single owned Screeps room from RCL 2 through early RCL 4.

The colony must:

1. Plan extensions after reaching RCL 2.
2. Build planned extensions without starving spawn refill or controller progress.
3. Use increased extension capacity to spawn stronger functional workers.
4. Plan the first tower after reaching RCL 3.
5. Prioritize completing the first tower over lower-priority construction.
6. Refill the tower up to a conservative reserve after it exists.
7. Keep tower behavior defensive and bounded.
8. Plan source containers only when useful and available at the current RCL.
9. Optionally plan very limited roads only when the implementation already has
   enough evidence to place them safely; otherwise document roads as deferred.
10. Plan early RCL 4 storage only after lower-RCL infrastructure is present.
11. Avoid duplicate, invalid, source-blocking, controller-blocking, or terrain-wall
   construction sites.
12. Keep construction planning incremental rather than flooding the room.
13. Preserve Slice 1 survival behavior under construction pressure.

## Out Of Scope

Do not implement or expand:

- multi-room behavior
- remote mining
- combat squads
- market or terminal behavior
- link/lab/factory planning
- advanced bunker layout
- complex road networks
- traffic management
- dynamic doctrine systems
- production deployment
- CI/CD behavior changes

If any of these are already present, audit only the parts directly needed for
this slice and avoid broadening them.

## Audit First

Before modifying gameplay behavior:

1. Inspect the current implementation.
2. Map every Slice 2 requirement to one of:
   - complete and tested
   - complete but untested
   - partially complete
   - missing
   - defective
3. Identify all existing later-slice behavior already present in the repository.
4. Determine whether current construction planning:
   - respects current RCL structure availability
   - counts existing structures and construction sites
   - avoids duplicate sites
   - avoids walls
   - avoids blocking source access
   - avoids blocking controller access
   - avoids blocking spawn access
   - handles stale or completed sites
   - respects the planning cadence and `forceReplan`
   - stops while emergency recovery is active
   - stops or defers under low CPU bucket
5. Determine whether current worker behavior:
   - refills spawn and extensions before building
   - refills tower before noncritical building when tower is below reserve
   - builds tower sites before extension/container/storage/road sites
   - allows controller progress while construction sites exist
   - limits the number of workers assigned to critical builds
   - clears invalid or completed build assignments
6. Produce `docs/construction-infrastructure-audit.md`.

Do not add features during the audit.

## Implementation Scope

After the audit, implement only the smallest changes required to complete Slice
2. Preserve the existing repository structure unless a narrow refactor is
necessary.

Keep decision logic testable and separate from Screeps globals where practical.
Do not introduce a persistent build queue or mature base planner.

## Required Behaviors

### Construction planning

The planner must:

- place no unnecessary construction at RCL 1
- place up to 5 extensions at RCL 2
- place up to 10 total extensions by RCL 3
- place up to 20 total extensions by early RCL 4
- place exactly one initial tower at RCL 3 when none exists or is planned
- place source containers only when containers are available and no container or
  container site is already near that source
- place early storage at RCL 4 only when storage is available, not already
  present or planned, and lower-priority prerequisites are satisfied
- never place structures that are unavailable at the current RCL
- not duplicate existing structures or sites
- not place sites on terrain walls
- not place non-container structures on source reserve tiles
- preserve at least one passable adjacent tile around sources, spawn, and
  controller
- remove or replan around existing non-container construction sites that block
  source access
- respect planning cadence and `forceReplan`
- skip planning while emergency mode is active
- skip planning when CPU bucket is below the configured low-CPU threshold

### Build priorities

Workers carrying energy must prioritize:

1. spawn refill
2. extension refill
3. tower refill up to reserve
4. critical construction
5. controller downgrade prevention
6. normal construction
7. normal controller upgrade
8. bounded repair

Critical construction for this slice is:

- tower sites
- extension sites needed to increase early energy capacity

Workers must not all abandon controller progress indefinitely when construction
sites exist. If critical construction is already saturated by assigned builders,
other loaded workers should continue upgrading when higher-priority refill needs
are satisfied.

### Tower behavior

The first tower must:

- attack hostiles before any noncombat action
- heal injured friendly creeps before repair when no hostiles exist
- repair only bounded non-wall targets when above reserve
- preserve the configured energy reserve
- not spend all energy repairing roads or walls

### Workforce and bodies

Construction demand may raise the early workforce target, but it must remain
bounded.

The colony should:

- remain within the existing early RCL worker caps except for intentional
  replacement overlap
- count workers currently spawning as Slice 1 already requires
- produce stronger bodies when RCL 2 extensions raise room energy capacity
- never wait for large bodies during emergency recovery

### Memory and reset behavior

Construction state must:

- store only serializable data in Memory
- preserve unrelated Memory fields
- survive global reset or new code deployment
- handle stale plans, completed sites, and missing objects
- avoid unbounded arrays

## Required Tests

Add or verify tests for:

1. RCL 1 does not place construction.
2. RCL 2 places extension sites.
3. RCL 2 does not exceed 5 total extensions plus extension sites.
4. RCL 3 places a tower when no tower or tower site exists.
5. RCL 3 does not place duplicate tower sites.
6. RCL 3 can plan additional extensions up to the RCL 3 limit.
7. Early RCL 4 can plan storage only when prerequisites are satisfied.
8. Construction planner does not place unavailable structure types.
9. Construction planner does not place on terrain walls.
10. Construction planner does not place duplicate occupied positions.
11. Construction planner preserves source access.
12. Construction planner preserves controller access.
13. Construction planner preserves spawn access.
14. Non-container source-blocking construction sites are removed or trigger a
    replan.
15. Planning cadence prevents per-tick full replanning.
16. `forceReplan` bypasses cadence once and then clears.
17. Emergency mode suppresses construction planning.
18. Low CPU bucket suppresses construction planning and visuals without breaking
    colony execution.
19. Loaded workers refill tower before noncritical construction when tower is
    below reserve.
20. Loaded workers build tower before extension/container/storage/road sites.
21. Loaded workers build extensions before lower-priority sites.
22. Saturated critical construction does not starve controller upgrade.
23. Completed or invalid build targets are cleared and reassigned.
24. Construction demand can raise workforce target but remains bounded.
25. Higher extension capacity produces stronger functional worker bodies.
26. Tower attacks hostile creeps before repair.
27. Tower heals injured friendly creeps before repair when no hostiles exist.
28. Tower preserves reserve and does not repair below reserve.
29. Wall and rampart repair remains bounded or deferred.
30. Construction memory survives a simulated global reset/new release.

Add deterministic multi-tick tests:

### Scenario C: RCL 2 Infrastructure

Given:

- one owned room
- RCL 2
- one spawn
- two sources
- stable Slice 1 worker population
- no extensions

Expected sequence:

- extension sites are planned incrementally
- workers continue spawn/extension refill priority
- workers build extension sites
- energy capacity increases
- stronger worker bodies are requested when affordable
- controller progress continues during construction
- construction sites are not spammed

### Scenario D: RCL 3 Tower

Given:

- one owned room
- RCL 3
- completed RCL 2 extensions
- no tower
- stable worker population

Expected sequence:

- one tower site is planned
- tower site is prioritized over lower-priority sites
- tower is refilled to reserve after completion
- tower attacks a hostile automatically
- tower does not spend below reserve on repair
- controller progress still occurs when higher-priority work is satisfied

## Commands

Run the repository equivalents of:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run verify
```

## Deployment Restriction

Do not deploy.
Do not activate a Screeps branch.
Do not edit code in the Screeps browser editor.
Do not use the production token.
Do not modify the CI/CD workflow.

## Definition Of Done

Slice 2 is complete when:

- every requirement is classified in `docs/construction-infrastructure-audit.md`
- missing or defective Slice 2 behavior is corrected
- all required tests pass
- no new out-of-scope gameplay features are introduced
- Slice 1 behavior remains covered and passing
- the live deployment process remains unchanged
- Codex stops after reporting results

Final response must include:

1. Current Slice 2 completion status.
2. Defects found.
3. Changes made.
4. Files changed.
5. Tests added or updated.
6. Commands run and results.
7. Behaviors that still require live observation.
8. Confirmation that no deployment occurred.
9. Recommended next slice, but do not implement it.
