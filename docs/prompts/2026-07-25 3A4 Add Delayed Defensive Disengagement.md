Execute Slice 3A4: Add Delayed Defensive Disengagement.

The deliverable is working code and tests. Do not merely create a prompt document.

## Objective

Prevent the colony from dropping directly from ENGAGE or ALERT to PEACE the instant hostiles disappear.

This slice adds a short threat-free delay before returning to PEACE.

It does not add RECOVER, tower commands, defender spawning, or creep coordination.

## Ownership

Use the existing flow:

ThreatAssessment
  -> ColonyDefenseCoordinator
  -> DefenseDecision
  -> ColonyDefenseMemory

The ColonyDefenseCoordinator owns the delayed disengagement rule.

## Memory change

Extend the existing defense memory:

type DefensivePosture = "peace" | "alert" | "engage";

interface ColonyDefenseMemory {
  posture: DefensivePosture;
  enteredAt: number;
  lastThreatTick?: number;
}

Preserve all existing memory fields.

## Configuration

Add or adapt one typed setting:

interface DefensePostureConfig {
  disengagementDelayTicks: number;
}

Use a small conservative default such as 3 ticks.

Do not scatter the value as a magic number.

## Required behavior

When threat severity is LOW, MEDIUM, or HIGH:

- calculate posture using the existing rules
- update lastThreatTick to Game.time
- transition normally between ALERT and ENGAGE

When threat severity is NONE:

- if the current posture is PEACE, remain PEACE
- if no previous threat tick exists, transition to PEACE
- if Game.time - lastThreatTick is less than disengagementDelayTicks:
  - preserve the current ALERT or ENGAGE posture
  - preserve enteredAt
  - do not log a transition
- once the delay expires:
  - transition to PEACE
  - reset enteredAt to Game.time
  - emit one transition log

Examples:

ENGAGE with last threat at tick 100:

- tick 101: remain ENGAGE
- tick 102: remain ENGAGE
- tick 103 or configured boundary: transition to PEACE

Use one clearly documented inclusive or exclusive boundary and test it directly.

## Integration

For each owned colony:

1. Build the existing ThreatAssessment.
2. Read existing ColonyDefenseMemory.
3. Apply the delayed disengagement rule.
4. Persist posture and lastThreatTick.
5. Show the persisted posture in existing colony status.

Do not change tower, spawn, or worker behavior.

## Status

Keep the existing status format.

The status should continue showing the persisted posture during the delay:

defense ENGAGE threat NONE hostiles 0

This is expected: no current threat is visible, but the colony remains temporarily engaged.

Do not add new per-tick logs.

## Tests

Write failing tests first.

Required tests:

1. Visible LOW threat updates lastThreatTick.
2. Visible MEDIUM threat updates lastThreatTick.
3. Visible HIGH threat updates lastThreatTick.
4. PEACE with no threat remains PEACE.
5. ENGAGE with no threat remains ENGAGE before the delay expires.
6. ALERT with no threat remains ALERT before the delay expires.
7. enteredAt is preserved while waiting.
8. No transition log is emitted during the waiting period.
9. ENGAGE transitions to PEACE when the delay expires.
10. ALERT transitions to PEACE when the delay expires.
11. Transition to PEACE resets enteredAt.
12. Transition to PEACE logs exactly once.
13. A new threat during the delay updates lastThreatTick and cancels disengagement.
14. Existing unrelated colony memory is preserved.
15. Multiple colonies maintain independent delay state.
16. All earlier slice tests remain passing.

## Restrictions

- Do not deploy.
- Do not push unless explicitly instructed.
- Do not modify CI/CD.
- Do not add RECOVER.
- Do not control towers.
- Do not spawn defenders.
- Do not modify worker behavior.
- Do not add target selection.
- Do not add strategic or doctrine logic.

## Verification

Run:

npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run verify

## Definition of done

Slice 3A4 is complete when:

- recent threat time is persisted per colony
- ALERT and ENGAGE do not instantly drop to PEACE
- the configured threat-free delay is deterministic
- posture transition logging remains one-time only
- all existing behavior and tests remain intact
- all verification commands pass
- no deployment occurred

Final response must include:

- files changed
- configuration added
- exact disengagement boundary used
- tests added
- verification results
- confirmation that no deployment occurred
- recommended next small slice, without implementing it