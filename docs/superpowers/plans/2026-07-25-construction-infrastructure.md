# Construction Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Slice 2 by auditing, testing, and minimally fixing construction and early infrastructure behavior for one owned Screeps room from RCL 2 through early RCL 4.

**Architecture:** Keep the existing architecture: `src/construction/construction-planner.ts` decides one incremental site, `src/creeps/creep-runner.ts` chooses worker actions from a tick-local snapshot, `src/structures/tower-controller.ts` owns tower actions, and `src/colony/colony-controller.ts` wires cadence, emergency, CPU, memory, and logging. Do not introduce a persistent build queue or mature layout planner.

**Tech Stack:** TypeScript, Vitest, Screeps-compatible runtime adapters, npm scripts from `package.json`.

## Global Constraints

- Do not deploy.
- Do not activate a Screeps branch.
- Do not edit code in the Screeps browser editor.
- Do not use the production token.
- Do not modify the CI/CD workflow.
- Preserve Slice 1 Bootstrap Economy behavior from `docs/bootstrap-economy-audit.md`.
- Do not implement multi-room behavior, remote mining, combat squads, market or terminal behavior, link/lab/factory planning, advanced bunker layout, complex road networks, traffic management, dynamic doctrine systems, or CI/CD behavior changes.
- Use TDD for behavior changes: add a failing test, verify it fails for the expected reason, implement the smallest fix, then verify it passes.

---

### Task 1: Audit Current Slice 2 State

**Files:**
- Create: `docs/construction-infrastructure-audit.md`
- Read: `docs/prompts/2026-07-25 slice 2 Construction and Early Infrastructure.md`
- Read: `docs/bootstrap-economy-audit.md`
- Read: `src/construction/construction-planner.ts`
- Read: `src/creeps/creep-runner.ts`
- Read: `src/structures/tower-controller.ts`
- Read: `src/colony/colony-controller.ts`
- Read: `test/unit/autonomous-colony.test.ts`

**Interfaces:**
- Consumes: current code and tests as authoritative evidence.
- Produces: `docs/construction-infrastructure-audit.md`, with each Slice 2 requirement classified as complete and tested, complete but untested, partially complete, missing, or defective.

- [ ] **Step 1: Write the audit document**

Create `docs/construction-infrastructure-audit.md` with these sections:

```markdown
# Construction and Early Infrastructure Audit

Scope source: `docs/prompts/2026-07-25 slice 2 Construction and Early Infrastructure.md`

Audit date: 2026-07-25

## Current State

## Slice 2 Requirement Map

## Required Test Map

## Later-Slice Behavior Already Present

## Construction Planning Findings

## Worker Priority Findings

## Defects To Fix For Slice 2

## Live Evidence Still Required
```

- [ ] **Step 2: Verify the audit exists**

Run: `Test-Path docs\construction-infrastructure-audit.md`

Expected: `True`

### Task 2: Add RED Tests For Missing Construction Guarantees

**Files:**
- Modify: `test/unit/autonomous-colony.test.ts`

**Interfaces:**
- Consumes: existing helpers `createRoom`, `createSpawn`, `createEnergyStructure`, `createWorker`, `createPos`, `constants`.
- Produces: direct tests for uncovered Slice 2 requirements.

- [ ] **Step 1: Add failing tests**

Add tests under `describe("construction and tower policy", () => { ... })`:

```typescript
test("does not place construction at RCL1", () => {
  const room = createRoom({ rcl: 1, structures: [createSpawn()] });

  expect(planConstruction(
    createColonySnapshot(room, constants),
    createInitialColonyMemory("W1N1", 1, 1),
    constants,
    1
  )).toBeUndefined();
});

test("preserves spawn access when planning construction", () => {
  const spawn = createSpawn();
  spawn.pos = createPos(20, 20);
  const room = createRoom({
    rcl: 2,
    structures: [spawn],
    terrainWalls: ["19,19", "20,19", "21,19", "19,20", "21,20", "19,21", "21,21"]
  });

  const plan = planConstruction(
    createColonySnapshot(room, constants),
    createInitialColonyMemory("W1N1", 2, 1),
    constants,
    1
  );

  expect(plan).toEqual(expect.objectContaining({ structureType: "extension" }));
  expect(plan).not.toEqual(expect.objectContaining({ x: 20, y: 21 }));
});

test("low CPU bucket suppresses construction planning and visuals but still runs workers", () => {
  const worker = createWorker("worker-low-cpu", 0);
  const room = Object.assign(createRoom({ rcl: 2, structures: [createSpawn()], creeps: [worker] }), {
    createConstructionSite: vi.fn(() => constants.OK)
  });

  runColony({
    game: { time: 70, rooms: { W1N1: room }, creeps: { "worker-low-cpu": worker } },
    memory: createInitialColonyMemory("W1N1", 2, 70),
    constants,
    log: vi.fn(),
    cpu: { getUsed: () => 1, bucket: 100 },
    config: { lowCpuBucket: 2000 }
  });

  expect(room.createConstructionSite).not.toHaveBeenCalled();
  expect(room.visual.text).not.toHaveBeenCalled();
  expect(worker.harvest).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run test/unit/autonomous-colony.test.ts -t "does not place construction at RCL1|preserves spawn access|low CPU bucket suppresses"`

Expected: at least one test fails for a real behavior gap, not a syntax or setup error.

### Task 3: Implement Minimal Construction Planner Fixes

**Files:**
- Modify: `src/construction/construction-planner.ts`
- Modify only if RED test shows controller wiring defect: `src/colony/colony-controller.ts`

**Interfaces:**
- Consumes: `planConstruction(snapshot, memory, constants, tick, cadence, strategy?)`.
- Produces: planner behavior that returns no construction at RCL1 and preserves source, spawn, and controller access.

- [ ] **Step 1: Make RCL1 return no construction**

In `desiredStructure`, ensure no construction kind returns before RCL 2:

```typescript
if (snapshot.rcl < 2) return undefined;
```

- [ ] **Step 2: Preserve spawn access through existing access check**

If the RED spawn-access test fails, update `preservesCriticalAccess` or its callers so the proposed tile is rejected when it consumes the final passable adjacent spawn tile. Keep the existing `criticalPositions` list including sources, spawns, and controller.

- [ ] **Step 3: Run GREEN tests**

Run: `npx vitest run test/unit/autonomous-colony.test.ts -t "does not place construction at RCL1|preserves spawn access|low CPU bucket suppresses"`

Expected: tests pass.

### Task 4: Add RED Tests For Storage And Tower Repair Boundaries

**Files:**
- Modify: `test/unit/autonomous-colony.test.ts`

**Interfaces:**
- Consumes: `planConstruction`, `runTower`, existing helpers.
- Produces: tests proving storage waits for lower-RCL infrastructure and tower repair stays bounded away from walls/ramparts.

- [ ] **Step 1: Add failing tests**

Add tests under `describe("construction and tower policy", () => { ... })`:

```typescript
test("does not plan RCL4 storage before source containers are present or planned", () => {
  const extensions = Array.from({ length: 20 }, (_, index) =>
    createEnergyStructure(constants.STRUCTURE_EXTENSION, 0, 50 + index)
  );
  const tower = createEnergyStructure(constants.STRUCTURE_TOWER, 500, 1000);
  const room = createRoom({ rcl: 4, structures: [createSpawn(), tower, ...extensions] });

  expect(planConstruction(
    createColonySnapshot(room, constants),
    createInitialColonyMemory("W1N1", 4, 1),
    constants,
    1
  )).toEqual(expect.objectContaining({ structureType: "container" }));
});

test("tower does not repair walls or ramparts", () => {
  const wall = { id: "wall", structureType: "constructedWall", hits: 100, hitsMax: 10000 };
  const rampart = { id: "rampart", structureType: "rampart", hits: 100, hitsMax: 10000 };
  const tower = {
    store: { getUsedCapacity: vi.fn(() => 900) },
    attack: vi.fn(),
    heal: vi.fn(),
    repair: vi.fn()
  };

  runTower({ tower, hostiles: [], injuredFriendlies: [], repairTargets: [wall, rampart], constants, reserve: 500 });

  expect(tower.repair).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run test/unit/autonomous-colony.test.ts -t "does not plan RCL4 storage|tower does not repair walls"`

Expected: at least one test fails for a real behavior gap.

### Task 5: Implement Minimal Storage And Tower Boundaries

**Files:**
- Modify: `src/construction/construction-planner.ts`
- Modify if RED: `src/structures/tower-controller.ts`

**Interfaces:**
- Consumes: `desiredStructure`, `sourceNeedingContainer`, `runTower`.
- Produces: RCL4 storage after extension, tower, and container prerequisites; tower repair ignores walls and ramparts.

- [ ] **Step 1: Reorder construction priority or gate storage**

Prefer the smallest local change in `desiredStructure`: before returning storage, require all sources to have a nearby container or container site.

```typescript
if (kind === "storage" && snapshot.rcl >= 4) {
  if (sourceNeedingContainer(snapshot, constants)) continue;
  const storageCount = countStructuresAndSites(snapshot, constants.STRUCTURE_STORAGE);
  if (storageCount < 1) return structureType;
}
```

- [ ] **Step 2: Ignore wall and rampart repair in tower controller if needed**

Filter `repairTargets` in `runTower`:

```typescript
const repairTarget = [...options.repairTargets]
  .filter((target) => {
    const structureType = (target as RepairTarget | undefined)?.structureType;
    return structureType !== "constructedWall" && structureType !== "rampart";
  })
  .sort((left, right) => repairPriority(left) - repairPriority(right))[0];
```

- [ ] **Step 3: Run GREEN tests**

Run: `npx vitest run test/unit/autonomous-colony.test.ts -t "does not plan RCL4 storage|tower does not repair walls"`

Expected: tests pass.

### Task 6: Final Audit Update And Verification

**Files:**
- Modify: `docs/construction-infrastructure-audit.md`

**Interfaces:**
- Consumes: test output and final code.
- Produces: final Slice 2 status and remaining live-observation list.

- [ ] **Step 1: Update final audit status**

Mark fixed defects as fixed and map every required test to evidence from `test/unit/autonomous-colony.test.ts`.

- [ ] **Step 2: Run required commands**

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run verify
```

Expected: all commands pass. If a command fails, fix the failure with TDD when it is a behavior issue, then rerun the failing command and any dependent verification.

- [ ] **Step 3: Confirm no deployment occurred**

Run: `git status --short`

Expected: no deployment artifacts or Screeps branch changes; only source, test, docs, and build artifacts expected from local verification.
