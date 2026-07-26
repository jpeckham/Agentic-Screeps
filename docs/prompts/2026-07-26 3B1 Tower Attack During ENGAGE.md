Execute Slice 3B1: Tower Attack During ENGAGE.

The deliverable is working code and tests. Do not merely create a prompt or audit document.

## Objective

When a colony’s persisted defensive posture is ENGAGE, select one hostile target at the colony level and order all available towers in that room to attack it.

This slice adds tower attack execution only.

## Ownership

Use this flow:

ThreatAssessment
  -> ColonyDefenseCoordinator
  -> TowerAttackIntent
  -> TowerController

Responsibilities:

- ThreatAssessment reports hostile facts.
- ColonyDefenseCoordinator selects the target.
- TowerController executes the provided attack order.
- Towers must not independently choose targets.

## In scope

- Deterministic hostile target selection
- One colony-level tower attack intent
- All available towers focus the selected target
- Safe handling of invalid targets and tower failures
- Tests
- Minimal status visibility for the selected target if appropriate

## Out of scope

Do not implement or change:

- tower healing
- tower repair policy
- defender spawning
- defender creep behavior
- safe mode
- remote defense
- strategic doctrine
- recovery behavior
- worker priorities
- CI/CD

Preserve all prior slice behavior.

## Required model

Create or adapt a small intent:

type TowerAttackIntent =
  | {
      type: "attack";
      targetId: Id<Creep>;
    }
  | {
      type: "hold";
    };

The ColonyDefenseCoordinator produces this intent.

Rules:

- posture ENGAGE with valid hostiles -> attack
- posture PEACE or ALERT -> hold
- posture ENGAGE with no valid hostile -> hold

Do not make TowerController inspect threat severity or posture directly if the architecture already supports passing an intent.

## Target selection

Select one hostile deterministically.

Use a simple scoring policy:

1. hostile with active HEAL parts
2. hostile with active RANGED_ATTACK parts
3. hostile with active ATTACK parts
4. hostile with active WORK parts
5. unarmed hostile

Within the same category, prefer:

- the hostile closest to a critical structure
- then the more damaged hostile
- then stable ID ordering as the final tie-breaker

Critical structures:

- spawn
- tower
- storage
- controller

Keep this small. Do not build a full combat simulator.

## Tower execution

For each tower in the owned room:

- if intent is attack, resolve targetId with Game.getObjectById
- if the target is valid, call tower.attack(target)
- if the target is invalid, do nothing and return a safe result
- if one tower throws or returns an error, continue processing remaining towers

All towers should normally attack the same selected target.

Do not let a tower independently retarget.

Do not repair or heal in this slice when posture is ENGAGE.

Existing non-ENGAGE tower behavior should remain unchanged unless a small refactor is required to prevent conflict.

## Status

Optionally extend existing status with a short target indicator:

defense ENGAGE threat HIGH hostiles 2 target ab12

Do not add per-tick attack logs.

Do not expose full object IDs if existing status uses compact formatting.

## Tests

Write failing tests first.

Required tests:

1. PEACE produces hold intent.
2. ALERT produces hold intent.
3. ENGAGE with no hostile produces hold intent.
4. ENGAGE with one hostile produces attack intent.
5. HEAL hostile outranks equivalent non-healer.
6. RANGED_ATTACK outranks equivalent melee-only hostile.
7. ATTACK outranks WORK-only hostile.
8. Armed hostile outranks unarmed hostile.
9. Closer hostile wins within the same category.
10. More damaged hostile wins when distance is equal.
11. Stable ID ordering breaks final ties deterministically.
12. All towers receive the same target.
13. Invalid target ID is handled safely.
14. One tower failure does not prevent another tower from attacking.
15. No repair occurs while ENGAGE attack intent is active.
16. No healing occurs while ENGAGE attack intent is active.
17. Existing Slice 1, Slice 2, and Slice 3A tests still pass.

## Restrictions

- Do not deploy.
- Do not push unless explicitly instructed.
- Do not modify CI/CD.
- Do not implement tower healing.
- Do not implement tower repair changes beyond preventing conflict during ENGAGE.
- Do not spawn defenders.
- Do not modify worker behavior.
- Do not implement RECOVER.
- Do not add strategic or doctrine logic.

## Verification

Run:

npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run verify

Use repository-equivalent commands if names differ.

## Definition of done

Slice 3B1 is complete when:

- ColonyDefenseCoordinator selects one deterministic hostile target
- all room towers focus that target during ENGAGE
- towers do not independently choose policy
- invalid targets and individual tower failures are safe
- no healing or repair occurs during active ENGAGE attack execution
- all existing tests and verification commands pass
- no deployment occurred

Final response must include:

- files changed
- target-selection rules implemented
- tests added
- verification results
- live behavior still requiring observation
- confirmation that no deployment occurred
- recommended next small slice, without implementing it