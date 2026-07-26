Complete Bootstrap Economy Slice 1 by fixing only the defects identified in
docs/bootstrap-economy-audit.md.

Do not implement or expand construction, towers, strategy selection, doctrine,
remote mining, telemetry infrastructure, visuals, or combat.

Do not deploy.

## Required changes

1. Account for creeps currently being spawned in workforce planning.

The planner must treat an active spawn operation as reserved workforce so that it
does not request another worker while one is already being created.

Account for:
- normal worker spawns
- emergency worker spawns
- replacement worker spawns
- the pending creep's name and memory when available
- replacement metadata such as `replacing`

Do not introduce a persistent spawn queue or large new abstraction.

2. Preserve intentional replacement overlap.

It is valid for visible workers to temporarily exceed the target when:
- an old worker is near expiration
- its replacement has already spawned
- both remain alive briefly

The fix must prevent duplicate requests without suppressing legitimate early
replacement.

3. Add direct tests for:

- a currently spawning worker counts toward workforce capacity
- a currently spawning emergency worker prevents a duplicate emergency spawn
- a currently spawning replacement prevents another replacement request
- an ordinary replacement overlap may temporarily exceed target
- stale replacement metadata does not permanently suppress future replacement
- a loaded worker refills an extension before upgrading
- colony memory survives a simulated global reset/new release
- unrelated Memory fields survive initialization and migration

Use test-driven development:
1. Add failing tests.
2. Implement the smallest fix.
3. Refactor only if necessary.

## Investigation requirement

Explain whether the live worker counts above target were caused by:
- legitimate replacement overlap
- failure to count `spawn.spawning`
- strategy-driven target changes
- a combination

Base the answer on the implemented code and tests, not speculation.

## Verification

Run the repository equivalents of:

npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run verify

## Restrictions

- Do not deploy.
- Do not activate or modify a Screeps code branch.
- Do not use production credentials.
- Do not modify CI/CD behavior.
- Do not add new gameplay capabilities.
- Stop after Slice 1 verification is complete.

## Definition of done

- Active spawning creeps are included in workforce accounting.
- Duplicate normal, emergency, and replacement spawn requests are prevented.
- Legitimate replacement overlap remains supported.
- The direct extension-priority test passes.
- The global-reset persistence test passes.
- All verification commands pass.
- docs/bootstrap-economy-audit.md is updated with final Slice 1 status.
- Final response confirms no deployment occurred.