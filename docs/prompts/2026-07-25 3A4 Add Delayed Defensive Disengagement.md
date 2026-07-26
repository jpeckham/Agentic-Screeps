Execute Slice 3A4: Add Delayed Defensive Disengagement.

The deliverable is working code and tests. Do not merely create a prompt document.

## Objective

Prevent the colony from dropping its defensive posture immediately when a threat disappears or weakens.

This slice adds delayed de-escalation only.

It does not control towers, spawn defenders, select targets, or add RECOVER.

## Ownership

Use this flow:

ThreatAssessment
  -> ColonyDefenseCoordinator
  -> raw DefenseDecision
  -> ColonyDefenseMemory
  -> persisted defensive posture
  -> colony status and transition log

The ColonyDefenseCoordinator still owns the raw posture decision from the current tick's threat assessment.

Memory only stabilizes posture transitions between ticks.

Do not place delayed disengagement logic inside:

- tower code
- spawn planning
- worker roles
- individual creeps
- construction planning
- strategic doctrine

## Required model

Keep the existing posture model:

type DefensivePosture = "peace" | "alert" | "engage";

Extend the existing colony defense memory with the smallest timing state needed:

interface ColonyDefenseMemory {
  posture: DefensivePosture;
  enteredAt: number;
  pendingPosture?: DefensivePosture;
  pendingSince?: number;
}

Store this under the existing colony memory structure.

Do not persist:

- hostile objects
- full threat assessments
- target IDs
- tower orders
- spawn requests

## Policy

Use this initial delay:

const DEFENSE_DISENGAGE_DELAY_TICKS = 25;

Escalation is immediate:

- PEACE -> ALERT
- PEACE -> ENGAGE
- ALERT -> ENGAGE

De-escalation is delayed:

- ENGAGE -> ALERT
- ENGAGE -> PEACE
- ALERT -> PEACE

If the raw DefenseDecision requests a lower posture than the persisted posture:

1. If no matching pending de-escalation exists:
   - set pendingPosture to the raw posture
   - set pendingSince to Game.time
   - keep the persisted posture unchanged
   - do not emit a transition log
2. If the same pendingPosture remains requested and Game.time - pendingSince is less than DEFENSE_DISENGAGE_DELAY_TICKS:
   - keep the persisted posture unchanged
   - preserve enteredAt
   - do not emit a transition log
3. If the same pendingPosture remains requested for at least DEFENSE_DISENGAGE_DELAY_TICKS:
   - update posture to pendingPosture
   - set enteredAt to Game.time
   - clear pendingPosture and pendingSince
   - emit one transition log

If the raw DefenseDecision is equal to the persisted posture:

- preserve enteredAt
- clear any pending de-escalation
- do not emit a transition log

If the raw DefenseDecision requests a higher posture than the persisted posture:

- update posture immediately
- set enteredAt to Game.time
- clear any pending de-escalation
- emit one transition log

Use an explicit posture ordering:

peace < alert < engage

Do not infer ordering from strings.

## Required behavior

Each tick:

1. Build the existing ThreatAssessment.
2. Produce the existing raw DefenseDecision.
3. Read the previous persisted ColonyDefenseMemory.
4. Apply delayed disengagement policy.
5. Store the effective persisted posture.
6. Show the effective persisted posture in colony status.

The status output must show the persisted posture, not the raw posture, while disengagement is pending.

Examples:

- Persisted ENGAGE, raw PEACE for 10 ticks: status still shows ENGAGE and no transition log.
- Persisted ENGAGE, raw PEACE for 25 ticks: update to PEACE and log `[colony E48S29] defense ENGAGE -> PEACE`.
- Persisted ENGAGE, raw PEACE pending, raw ENGAGE returns before the delay expires: clear pending disengagement and keep ENGAGE.
- Persisted ALERT, raw PEACE pending, raw ENGAGE appears: update immediately to ENGAGE and log `[colony E48S29] defense ALERT -> ENGAGE`.

Do not log every tick.

## Memory migration

If the repository has schema-versioned memory migration:

- add the smallest idempotent migration needed
- preserve all existing colony memory
- preserve existing defense.posture and defense.enteredAt
- safely initialize missing pending fields by leaving them absent

If no migration framework exists, initialize defensively at runtime without adding a new framework.

## Tests

Write failing tests first.

Required tests:

1. Escalation from PEACE to ALERT is immediate.
2. Escalation from PEACE to ENGAGE is immediate.
3. Escalation from ALERT to ENGAGE is immediate.
4. ENGAGE to PEACE does not change before the disengage delay expires.
5. ENGAGE to ALERT does not change before the disengage delay expires.
6. ALERT to PEACE does not change before the disengage delay expires.
7. A pending de-escalation preserves enteredAt.
8. A pending de-escalation produces no transition log.
9. A completed delayed de-escalation updates posture.
10. A completed delayed de-escalation resets enteredAt.
11. A completed delayed de-escalation logs exactly once.
12. Returning to the persisted posture clears pending disengagement.
13. Escalating while a de-escalation is pending clears pending disengagement.
14. Changing from one pending lower posture to another resets pendingSince.
15. Existing unrelated colony memory is preserved.
16. Multiple colonies maintain independent disengagement timers.
17. Colony status shows the persisted posture while de-escalation is pending.
18. Tower behavior is unchanged.
19. Spawn planning is unchanged.
20. Worker behavior is unchanged.
21. Existing Slice 1, Slice 2, Slice 3A1, Slice 3A2, and Slice 3A3 tests still pass.

## Restrictions

- Do not deploy.
- Do not push unless explicitly instructed.
- Do not modify CI/CD.
- Do not control towers.
- Do not spawn defenders.
- Do not add RECOVER.
- Do not modify worker behavior.
- Do not add target selection.
- Do not persist hostile objects.
- Do not persist full threat assessments.
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

Slice 3A4 is complete when:

- defensive escalation remains immediate
- defensive de-escalation is delayed by DEFENSE_DISENGAGE_DELAY_TICKS
- enteredAt changes only when the persisted posture changes
- pending disengagement does not log every tick
- transition logs occur once per completed posture change
- colony status shows the persisted posture
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
