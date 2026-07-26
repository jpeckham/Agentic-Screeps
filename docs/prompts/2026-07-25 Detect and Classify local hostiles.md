Execute Slice 3A1: Detect and Classify Local Hostiles.

The deliverable is working code and tests. Do not merely create a prompt document.

## Objective

For each owned colony, detect hostile creeps in the current room and produce a simple threat assessment that can be shown in the existing colony status.

This slice observes threats only. It does not respond to them.

## Ownership

Implement this as colony-level analysis:

ColonySnapshot
  -> ThreatAssessment
  -> colony status output

ThreatAssessment reports facts only.

It must not:

- control towers
- spawn defenders
- change worker behavior
- create defensive posture state
- activate safe mode
- implement strategy or doctrine

## Required model

Create or adapt:

type ThreatSeverity = "none" | "low" | "medium" | "high";

interface ThreatAssessment {
  hostileCount: number;
  meleeParts: number;
  rangedParts: number;
  healParts: number;
  workParts: number;
  severity: ThreatSeverity;
}

Count only active body parts.

Classify severity using this simple policy:

- none: no hostile creeps
- low: hostile creeps exist but have no active ATTACK, RANGED_ATTACK, HEAL, or WORK parts
- medium: exactly one hostile has any active combat-capable part
- high: multiple armed hostiles exist or any hostile has active HEAL parts

Keep the classification deterministic.

## Integration

For each owned room:

1. Reuse the existing tick-local colony snapshot where practical.
2. Detect hostile creeps once.
3. Build one ThreatAssessment.
4. Make it available to the colony controller and status output.

Do not persist the full assessment in Memory.

Do not add a defense state machine.

## Status output

Add these fields to the existing status line:

threat NONE hostiles 0

or:

threat MEDIUM hostiles 1

Do not add per-tick threat logs.

Do not change existing status cadence.

## Tests

Write failing tests first.

Required tests:

1. No hostiles returns severity none.
2. One unarmed hostile returns low.
3. One hostile with ATTACK returns medium.
4. One hostile with RANGED_ATTACK returns medium.
5. One hostile with WORK returns medium.
6. One hostile with HEAL returns high.
7. Multiple armed hostiles return high.
8. Destroyed body parts are not counted.
9. Existing colony status includes severity and hostile count.
10. Existing Slice 1 and Slice 2 tests remain unchanged and passing.

## Restrictions

- Do not deploy.
- Do not push unless explicitly instructed.
- Do not modify CI/CD.
- Do not implement tower behavior.
- Do not implement defensive posture.
- Do not implement defender spawning.
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

Slice 3A1 is complete when:

- owned-room hostiles are detected
- active hostile body parts are counted
- severity is classified deterministically
- colony status displays threat severity and hostile count
- all tests and verification commands pass
- no deployment occurred

Final response must report:

- files changed
- tests added
- verification results
- confirmation that no deployment occurred
- recommended next small slice, without implementing it