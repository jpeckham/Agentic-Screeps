Execute Slice 3A3: Persist Defensive Posture Transitions.

The deliverable is working code and tests. Do not merely create a prompt document.

## Objective

Persist the colony’s current defensive posture so the AI can detect when posture changes between ticks.

This slice adds transition memory only.

It does not control towers, spawn defenders, or add delayed disengagement.

## Ownership

Use this flow:

ThreatAssessment
  -> ColonyDefenseCoordinator
  -> DefenseDecision
  -> ColonyDefenseMemory
  -> colony status and transition log

The ColonyDefenseCoordinator still owns the posture decision.

Memory only records the result.

## Required memory

Create or adapt:

type DefensivePosture = "peace" | "alert" | "engage";

interface ColonyDefenseMemory {
  posture: DefensivePosture;
  enteredAt: number;
}

Store this under the existing colony memory structure.

Do not persist:

- hostile objects
- full threat assessments
- target IDs
- tower orders
- spawn requests

## Required behavior

Each tick:

1. Calculate the current DefenseDecision using the existing threat assessment.
2. Read the previous persisted posture.
3. If no defense memory exists:
   - initialize it with the current posture
   - set enteredAt to Game.time
4. If the posture has not changed:
   - preserve enteredAt
   - do not log
5. If the posture changed:
   - update posture
   - set enteredAt to Game.time
   - emit one transition log

Examples:

[colony E48S29] defense PEACE -> ALERT
[colony E48S29] defense ALERT -> ENGAGE
[colony E48S29] defense ENGAGE -> PEACE

Do not log every tick.

## Integration

For each owned colony:

1. Build the existing ThreatAssessment.
2. Produce the existing DefenseDecision.
3. Update ColonyDefenseMemory.
4. Show the current persisted posture in colony status.

Do not make towers, workers, or spawn planning consume the posture yet.

## Memory migration

If the repository has schema-versioned memory migration:

- add the smallest idempotent migration needed
- preserve all existing colony memory
- safely initialize missing defense memory

If no migration framework exists, initialize defensively at runtime without adding a new framework.

## Tests

Write failing tests first.

Required tests:

1. Missing defense memory initializes with the current posture.
2. Initialization sets enteredAt to the current tick.
3. Unchanged posture preserves enteredAt.
4. Unchanged posture produces no transition log.
5. PEACE to ALERT updates memory.
6. ALERT to ENGAGE updates memory.
7. ENGAGE to PEACE updates memory.
8. A posture change resets enteredAt.
9. A posture change logs exactly once.
10. Existing unrelated colony memory is preserved.
11. Multiple colonies maintain independent defense memory.
12. Existing Slice 1, Slice 2, Slice 3A1, and Slice 3A2 tests still pass.

## Restrictions

- Do not deploy.
- Do not push unless explicitly instructed.
- Do not modify CI/CD.
- Do not control towers.
- Do not spawn defenders.
- Do not add RECOVER.
- Do not add transition delays.
- Do not modify worker behavior.
- Do not add target selection.
- Do not create empty future defense classes.

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

Slice 3A3 is complete when:

- defensive posture is persisted per colony
- enteredAt changes only when posture changes
- transition logs occur once per change
- unrelated memory remains intact
- tower, spawn, and worker behavior remain unchanged
- all verification commands pass
- no deployment occurred

Final response must include:

- files changed
- memory structure added or changed
- tests added
- verification results
- confirmation that no deployment occurred
- recommended next small slice, without implementing it