Execute Slice 3A2: Engage a Local Defensive Posture.

The deliverable is working code and tests. Do not merely create a prompt document.

## Objective

Use the existing local ThreatAssessment to determine one colony-level defensive posture:

- PEACE
- ALERT
- ENGAGE

This slice decides the posture only. It does not control towers or spawn defenders.

## Ownership

Implement this at the colony level:

ThreatAssessment
  -> ColonyDefenseCoordinator
  -> DefensivePosture
  -> colony status output

The ColonyDefenseCoordinator owns the posture decision.

Do not place posture logic inside:

- tower code
- spawn planning
- worker roles
- individual creeps
- strategic doctrine

## Required model

Create or adapt:

type DefensivePosture = "peace" | "alert" | "engage";

interface DefenseDecision {
  posture: DefensivePosture;
  reason: string;
}

Use the existing ThreatAssessment from Slice 3A1.

## Decision rules

Use this simple policy:

- threat NONE -> PEACE
- threat LOW -> ALERT
- threat MEDIUM or HIGH -> ENGAGE

The result must be deterministic.

Do not add persistence or transition delays yet.

Do not add RECOVER yet.

Each tick, calculate the posture directly from the current threat assessment.

## Integration

For each owned colony:

1. Build or reuse the existing ThreatAssessment.
2. Pass it to ColonyDefenseCoordinator.
3. Produce one DefenseDecision.
4. Expose the posture in the existing colony status.

Do not make towers or creeps consume the posture yet.

## Status output

Extend the existing status with:

defense PEACE threat NONE hostiles 0

or:

defense ALERT threat LOW hostiles 1

or:

defense ENGAGE threat HIGH hostiles 2

Do not add transition logs yet.

Do not change the existing status cadence.

## Tests

Write failing tests first.

Required tests:

1. NONE threat produces PEACE.
2. LOW threat produces ALERT.
3. MEDIUM threat produces ENGAGE.
4. HIGH threat produces ENGAGE.
5. The same assessment always produces the same decision.
6. Colony status includes defensive posture.
7. Tower behavior is unchanged.
8. Spawn planning is unchanged.
9. Worker behavior is unchanged.
10. Existing Slice 1, Slice 2, and Slice 3A1 tests still pass.

## Restrictions

- Do not deploy.
- Do not push unless explicitly instructed.
- Do not modify CI/CD.
- Do not implement tower orders.
- Do not implement defender spawning.
- Do not persist posture in Memory.
- Do not implement transition delays.
- Do not implement RECOVER.
- Do not modify worker priorities.
- Do not create empty future defense classes.

## Verification

Run:

npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run verify

## Definition of done

Slice 3A2 is complete when:

- ColonyDefenseCoordinator maps threat severity to posture
- posture ownership is separate from threat assessment
- colony status displays the posture
- tower, spawn, and worker behavior remain unchanged
- all tests and verification commands pass
- no deployment occurred

Final response must report:

- files changed
- tests added
- verification results
- confirmation that no deployment occurred
- recommended next small slice, without implementing it