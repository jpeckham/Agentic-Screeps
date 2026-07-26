# Goal: Build the First Autonomous Screeps Colony

Implement the first production gameplay capability for my live Screeps AI: a safe, observable, self-healing, single-room colony capable of autonomously progressing through the early Room Controller Levels.

The colony is currently in a novice area with approximately 25 days remaining. The immediate objective is not warfare, expansion, remote mining, market trading, advanced doctrine, or multi-room empire management.

The immediate objective is:

Keep the initial room alive continuously, establish a stable energy economy, progress its controller level, construct the correct early infrastructure, recover from creep losses, and provide clear in-game evidence that the automation is behaving correctly.

This code will deploy through the existing CI/CD harness to the live default Screeps branch and main module. Preserve that working pipeline.

## First action

Before modifying code:

- Inspect the repository and current CI/CD implementation.
- Identify:
  - the exported Screeps loop
  - runtime safety and survival-loop behavior
  - current test framework
  - current Screeps type definitions
  - current memory schema
  - current build output
- Determine what gameplay code already exists.
- Produce a concise implementation plan.
- Implement it without waiting for additional approval.

Do not replace working CI/CD, deployment, health-monitoring, error-boundary, or memory-migration behavior.

## Scope

Implement a single-room autonomous colony for RCL 1 through early RCL 4.

The colony must manage:

- source harvesting
- creep spawning
- energy delivery
- controller upgrading
- construction
- basic repair
- creep replacement
- emergency recovery
- cleanup of dead-creep memory
- basic telemetry
- visible room status

Do not implement:

- claiming another room
- reserving rooms
- remote mining
- military offense
- sophisticated defense
- market activity
- minerals
- labs
- factories
- terminals
- observer logic
- doctrine detection
- strategic planning
- GOAP
- dynamic code generation
- complex traffic management
- elaborate road planning
- multi-room orchestration

Leave clean seams for those capabilities without building them now.

# Architectural direction

Use a lightweight hierarchy:

main loop  
→ runtime safety boundary  
→ colony discovery  
→ colony controller  
→ colony assessment  
→ spawn planning  
→ creep assignment  
→ creep execution  
→ structure execution  
→ telemetry

Use these conceptual boundaries:

ColonyController  
├── ColonySnapshot  
├── WorkforcePlanner  
├── SpawnManager  
├── WorkAssignment  
├── CreepExecutor  
├── ConstructionPlanner  
├── RepairPlanner  
└── ColonyTelemetry

The code should remain simple enough to understand while establishing boundaries that can later support:

- multiple colonies
- shared intelligence
- operations
- strategic objectives
- adaptive doctrine
- combat commanders

Do not introduce a dependency-injection container or heavy framework.

## Recommended structure

Adapt this to existing repository conventions:

src/  
├── main.ts  
├── colony/  
│ ├── colony-controller.ts  
│ ├── colony-snapshot.ts  
│ ├── colony-state.ts  
│ └── colony-telemetry.ts  
├── workforce/  
│ ├── workforce-planner.ts  
│ ├── spawn-manager.ts  
│ ├── body-builder.ts  
│ ├── role.ts  
│ └── role-assignment.ts  
├── creeps/  
│ ├── creep-runner.ts  
│ ├── creep-state.ts  
│ ├── actions/  
│ │ ├── harvest.ts  
│ │ ├── deliver-energy.ts  
│ │ ├── build.ts  
│ │ ├── upgrade.ts  
│ │ └── repair.ts  
│ └── roles/  
│ ├── worker.ts  
│ └── emergency-worker.ts  
├── construction/  
│ ├── construction-planner.ts  
│ └── early-room-plan.ts  
├── structures/  
│ ├── structure-runner.ts  
│ └── tower-controller.ts  
├── memory/  
│ ├── schema.ts  
│ └── migrations.ts  
└── visualization/  
└── room-status-visual.ts  
<br/>test/  
├── colony/  
├── workforce/  
├── creeps/  
├── construction/  
└── runtime/

Do not create empty placeholder files merely to match this tree.

# Design principle: capability before specialization

For the first iteration, prefer a small number of flexible workers over many brittle roles.

A worker may be capable of:

- harvesting
- delivering energy
- building
- upgrading
- performing basic repairs

Its current assignment determines what it does.

Avoid prematurely introducing separate classes for:

- harvester
- hauler
- builder
- upgrader
- repairer

The architecture must permit specialization later, but the first colony should favor reliability and simple recovery.

Use explicit assignment types such as:

type WorkType =  
| "harvest"  
| "deliver"  
| "build"  
| "upgrade"  
| "repair";

Each creep should have only the minimum persistent state needed to continue useful work.

# Required in-game behaviors

The following are the acceptance behaviors I will inspect in the live game.

## 1\. Initial startup

When the code first runs in my owned room:

- It detects the owned room automatically.
- It does not require a hardcoded room name.
- It detects the room controller, spawn, available sources, construction sites, structures, and existing creeps.
- It initializes memory safely.
- It does not erase unrelated existing memory.
- It logs the current build version once when the release changes.
- It begins operating without manual console commands.

Expected visible result:

- Existing creeps begin performing useful work.
- The spawn begins creating needed workers when energy allows.
- The controller begins receiving upgrades.
- The console does not continuously emit exceptions.

## 2\. Basic worker behavior

A worker with free capacity should obtain energy.

Priority for obtaining energy:

- Withdraw from a suitable container or storage structure when one exists and has usable energy.
- Otherwise harvest from an assigned source.

A worker carrying energy should choose useful work according to colony priorities.

Initial delivery priority:

- Spawn needing energy.
- Extensions needing energy.
- Tower needing energy below its configured reserve target.
- Critical construction.
- Controller upgrading.
- Noncritical repair or construction.

A worker should not oscillate between harvesting and delivery every tick.

Use a clear state transition based on capacity:

empty or nearly empty  
→ acquire energy  
<br/>full or unable to acquire more  
→ perform assigned energy-consuming work

Expected visible result:

- Workers harvest until meaningfully loaded.
- Workers move energy to the spawn and extensions.
- Workers upgrade the controller when higher-priority energy needs are satisfied.
- Workers do not stand idle while valid work is available.

## 3\. Workforce planning

The colony should calculate a desired workforce based on the room's current state.

At minimum, account for:

- number of sources
- available room energy capacity
- existing viable creeps
- creeps near end of life
- active construction demand
- room controller level
- emergency state

For the initial implementation, use conservative heuristics.

A reasonable baseline is:

Emergency:  
1 minimal worker immediately  
<br/>RCL 1:  
2-3 general workers  
<br/>RCL 2:  
3-5 general workers  
<br/>RCL 3:  
4-6 general workers  
<br/>Early RCL 4:  
enough workers to sustain harvesting, refilling, construction, and upgrading

Do not treat those numbers as rigid constants when room conditions justify adjustment.

Expected visible result:

- The spawn does not create endless creeps.
- The colony maintains enough workers to continue operating.
- Replacement creeps are created before old creeps all expire.
- Spawn energy demand does not permanently starve controller progress.

## 4\. Body construction

Creep bodies must be constructed according to available energy.

The colony must support a bootstrap body that can be spawned with the room's minimum available energy.

Minimum emergency body:

\[WORK, CARRY, MOVE\]

As energy capacity increases, create balanced worker bodies with additional:

- WORK
- CARRY
- MOVE

Do not wait indefinitely for maximum energy if no viable worker exists.

Under normal conditions, the spawn may wait for a better body when:

- at least one viable worker exists
- energy income is active
- waiting will not jeopardize survival

Expected visible result:

- A dead colony can restart with a 200-energy worker.
- A healthy colony creates stronger workers as extension capacity grows.
- Creeps are not spawned with immobile or unusable bodies.

## 5\. Emergency recovery

The colony must recover from complete or near-complete workforce loss.

Emergency mode should activate when:

- no viable worker can harvest and deliver energy
- or all surviving workers are about to expire before a replacement can reasonably be produced

Emergency behavior:

- stop waiting for ideal body size
- suppress nonessential spawning
- spawn one \[WORK, CARRY, MOVE\] worker as soon as 200 energy is available
- direct it to harvest and refill the spawn
- rebuild the normal workforce gradually
- suppress expensive planning and unnecessary visuals if CPU is constrained

Expected visible result:

- Killing all creeps does not permanently brick the colony, provided the spawn has or can obtain enough energy for a bootstrap worker.
- The colony visibly returns from emergency mode to normal operation.

Document the unavoidable limitation that a spawn with insufficient stored energy and no creeps cannot recover autonomously.

## 6\. Creep replacement

The spawn planner must consider remaining creep life.

Do not wait until a critical worker disappears before requesting its replacement.

Replacement lead time should account approximately for:

- body spawn duration
- travel time to its primary work area
- a small safety margin

Avoid double-counting an old creep and its replacement as permanent excess capacity.

Expected visible result:

- New workers appear before critical workers expire.
- There is minimal interruption to harvesting.
- The colony does not repeatedly spawn duplicate replacements for the same expiring creep.

## 7\. Controller upgrading

Controller upgrading must occur whenever:

- survival needs are met
- spawn and extension refill demand is under control
- no higher-priority emergency exists

Prevent controller downgrade from becoming an emergency.

When downgrade risk becomes elevated:

- increase controller-upgrade priority
- temporarily deprioritize noncritical construction and repair

Expected visible result:

- The controller progresses continuously through early RCL levels.
- Upgrading pauses temporarily when the colony must refill or recover.
- The controller does not decay because every worker is permanently assigned elsewhere.

## 8\. Construction planning

The code should place construction sites appropriate to the current RCL.

Do not place an entire mature-base blueprint.

For the first step, support:

### RCL 1

- no unnecessary construction
- prioritize controller progression

### RCL 2

- place available extensions
- optionally place a small number of roads only when justified
- place containers near sources only when permitted and useful

### RCL 3

- place the first tower
- place additional extensions
- add containers or limited roads where useful

### Early RCL 4

- place available extensions
- place storage when appropriate
- do not attempt advanced base planning yet

Construction planning must:

- obey terrain
- avoid blocking sources
- avoid blocking the controller
- avoid blocking the spawn
- avoid exits
- avoid duplicate construction sites
- respect structure limits
- place sites incrementally
- avoid consuming excessive CPU every tick

Run layout planning at a low cadence or in response to RCL changes.

Expected visible result:

- Extensions appear as RCL permits them.
- A tower construction site appears at RCL 3.
- Construction sites are not spammed across the room.
- The spawn and sources remain accessible.
- The room remains visually understandable.

Do not assume a globally optimal bunker layout in this first step.

## 9\. Building priorities

Workers should build only after critical energy delivery needs are under control.

Construction priority:

- Spawn replacement if ever applicable.
- Tower.
- Extensions.
- Containers.
- Storage.
- Roads.
- Other allowed early structures.

Expected visible result:

- Extensions and the tower complete before decorative or low-value roads.
- Building does not completely halt controller upgrading.
- The colony does not create so many sites that all energy disappears into construction indefinitely.

## 10\. Repairs

Implement only basic repair policy.

Repair:

- critically damaged spawn
- critically damaged extensions
- critically damaged tower
- critically damaged containers
- important roads below a configured threshold

Do not attempt to maximize wall or rampart hit points.

Do not repair walls or ramparts beyond a low starter threshold unless required for immediate survival.

Expected visible result:

- Important structures do not decay unnecessarily.
- Workers do not spend all their time repairing roads or walls.
- Repair work remains subordinate to survival, energy delivery, and controller progression.

## 11\. Tower behavior

When a tower exists:

Priority:

- Attack hostile creeps in the owned room.
- Heal damaged friendly creeps.
- Repair only when tower energy is above a reserve threshold.
- Prefer important infrastructure repairs.
- Avoid draining itself on low-priority repairs.

Expected visible result:

- A hostile entering the room is targeted automatically.
- Injured friendly creeps are healed when there is no hostile.
- The tower preserves enough energy to remain defensively useful.

## 12\. Dead creep memory cleanup

Remove memory for creeps that no longer exist.

Do this safely and at an appropriate cadence.

Expected visible result:

- Memory.creeps does not grow indefinitely.
- Active creep memory remains untouched.

## 13\. CPU-aware behavior

Track basic CPU usage.

The colony must preserve these behaviors under CPU pressure:

- tower defense
- emergency spawning
- creep execution
- spawn refill
- harvesting
- controller downgrade prevention

Lower-priority behavior may run less often:

- construction planning
- repair planning
- visualizations
- detailed telemetry
- workforce recalculation when recent results remain valid

Expected visible result:

- The code does not repeatedly exceed its CPU limit under normal early-room conditions.
- The colony continues performing critical work when the bucket is low.
- Expensive scans are not redundantly repeated by every creep.

## 14\. Tick-local room snapshot

Build one tick-local colony snapshot and share it among planners.

It should include indexes or summaries for:

- owned creeps
- spawn and extensions
- sources
- controller
- energy structures
- construction sites
- damaged structures
- hostiles
- available energy
- energy capacity
- current RCL

Avoid having each creep independently call broad room searches for the same information.

Do not persist live Screeps objects into Memory.

Expected result:

- Room scanning remains centralized.
- Tests can construct simplified snapshots without requiring the live game.

## 15\. Memory strategy

Persist only durable state.

Reasonable persistent state includes:

- schema version
- colony identifier
- last known RCL
- creep assignments
- source assignments
- workforce planning state
- emergency state
- planning cadence
- release health state

Do not persist:

- live Room, Creep, Source, or structure objects
- full tick snapshots
- values cheap to recompute each tick
- unbounded telemetry history

Use IDs, room names, coordinates, small enums, and compact records.

Add migrations for schema changes.

## 16\. In-game observability

I need to understand what the colony is doing by watching the room and console.

Implement concise console telemetry.

Log on significant state changes, not every tick:

\[release abc12345\] activated  
\[colony W1N1\] initialized at RCL 1  
\[colony W1N1\] emergency mode entered: no viable workers  
\[colony W1N1\] spawning emergency-worker-1234 \[WORK,CARRY,MOVE\]  
\[colony W1N1\] emergency mode cleared  
\[colony W1N1\] reached RCL 2  
\[colony W1N1\] construction plan updated: 5 extensions  
\[colony W1N1\] workforce target changed: 3 → 4

Avoid continuous noisy logs such as one line per creep per tick.

### Room visual

Add a compact room visual that can be disabled through configuration.

Display near the controller or spawn:

RCL: 2  
Mode: NORMAL  
Energy: 300 / 550  
Workers: 4 / 4  
Assignments:  
Harvest 2  
Deliver 1  
Upgrade 1  
Build sites: 3  
CPU: 1.4  
Release: abc12345

Keep the display concise.

Expected visible result:

- I can open the room and immediately see whether the colony is healthy.
- I can identify emergency mode.
- I can see the deployed release.
- I can see workforce actual versus desired.

## 17\. Manual inspection commands

Expose a minimal safe console API through global.

Example:

global.ai = {  
status(roomName?: string): unknown,  
setVisuals(enabled: boolean): void,  
forceReplan(roomName?: string): void  
};

Requirements:

- commands must be read-only except for explicitly safe configuration changes
- do not expose destructive reset commands
- do not provide a console command that wipes memory
- commands must not be required for normal operation

Expected use:

ai.status()  
ai.status("W1N1")  
ai.setVisuals(false)  
ai.forceReplan("W1N1")

## 18\. Configuration

Create typed configuration with conservative defaults.

Example categories:

interface ColonyConfig {  
visualsEnabled: boolean;  
statusLogInterval: number;  
emergencyTtlThreshold: number;  
towerEnergyReserve: number;  
repairThreshold: number;  
controllerEmergencyThreshold: number;  
planningCadence: number;  
}

Do not put frequently changed tuning values throughout the code as magic numbers.

# Assignment model

Workers need stable but revisable assignments.

Use source assignment to avoid every worker selecting the same source.

Use work assignment for current purpose.

Example memory:

interface CreepMemory {  
colony: string;  
role: "worker" | "emergency-worker";  
mode: "acquire" | "work";  
assignment?: {  
type: WorkType;  
targetId?: Id&lt;RoomObject&gt;;  
sourceId?: Id&lt;Source&gt;;  
};  
replacing?: string;  
}

Do not overpersist action-by-action state.

Assignments must be invalidated when:

- target no longer exists
- target is full
- construction completes
- structure no longer needs repair
- source is unavailable
- higher-priority emergency work appears
- creep no longer has the required body capability

# Decision priorities

Use explicit, testable priority functions rather than scattered conditionals.

At the colony level:

1\. Defend against present hostiles  
2\. Recover from workforce collapse  
3\. Preserve harvesting capability  
4\. Refill spawn and extensions  
5\. Prevent controller downgrade  
6\. Build critical infrastructure  
7\. Maintain normal controller progress  
8\. Perform bounded repairs  
9\. Build lower-priority infrastructure

At the worker level while carrying energy:

1\. Emergency spawn refill  
2\. Spawn or extension refill  
3\. Tower refill  
4\. Critical build  
5\. Controller downgrade prevention  
6\. Normal build  
7\. Normal upgrade  
8\. Repair

The exact implementation may use scoring, ordered policies, or small evaluators, but it must be deterministic and covered by tests.

# Testing requirements

Use test-driven development.

Write a failing test before implementing each meaningful behavior.

Do not call the live Screeps API in tests.

Use narrow mocks or test fixtures for Screeps objects.

## Required unit tests

### Workforce planning

- Requests an emergency worker when no viable workers exist.
- Does not wait for maximum energy during emergency.
- Does not exceed the desired workforce.
- Counts an incoming replacement appropriately.
- Requests replacement before a critical creep expires.
- Increases workforce for meaningful construction demand.
- Avoids uncontrolled workforce growth.

### Body building

- Produces \[WORK, CARRY, MOVE\] at 200 energy.
- Never exceeds available energy.
- Produces a functional body.
- Adds movement sufficient for the body to move.
- Produces larger balanced bodies when energy capacity increases.
- Falls back safely for unexpected energy values.

### Worker state

- Empty worker enters acquire mode.
- Full worker enters work mode.
- Worker remains in acquire mode until meaningfully loaded.
- Invalid assignments are cleared.
- Worker chooses spawn refill before upgrading.
- Worker chooses controller work when no higher priority exists.
- Worker does not attempt actions its body cannot perform.

### Emergency recovery

- No workers causes emergency mode.
- Emergency mode requests one bootstrap worker.
- Emergency mode suppresses nonessential planning.
- The first emergency worker harvests.
- A loaded emergency worker refills the spawn.
- Normal mode resumes after recovery criteria are satisfied.

### Construction

- Does not place structures unavailable at the current RCL.
- Does not place duplicate sites.
- Does not place on walls.
- Does not block the source.
- Does not block the controller.
- Places extensions after reaching RCL 2.
- Places a tower after reaching RCL 3.
- Plans incrementally rather than flooding the room.

### Priorities

- Hostile defense outranks repair.
- Spawn refill outranks upgrading.
- Controller downgrade prevention outranks normal construction.
- Critical structures outrank roads.
- Wall repair is bounded.

### Runtime safety

- One creep failure does not prevent other creeps from running.
- One colony subsystem failure does not bypass the existing survival loop.
- Top-level failure still invokes the existing runtime fallback.
- Telemetry failures do not stop colony execution.

### Memory

- Empty memory initializes safely.
- Existing unrelated memory survives initialization.
- Dead creep memory is removed.
- Live creep memory is retained.
- Migration runs idempotently.
- A new release does not wipe colony state.

## Integration-style tests

Create deterministic multi-tick scenarios using mocked game ticks or the existing test harness.

Required scenarios:

### Scenario A: Fresh RCL 1 room

Given:

- one owned spawn
- one controller
- two sources
- 300 spawn energy
- no creeps

Expected over simulated ticks:

- worker is spawned
- worker harvests
- worker delivers energy
- additional workers are spawned
- controller receives upgrades

### Scenario B: Total workforce death

Given:

- established early room
- all creeps removed
- spawn contains at least 200 energy

Expected:

- emergency mode activates
- one minimal worker is spawned
- it harvests and refills
- normal workforce begins rebuilding
- emergency mode clears

### Scenario C: RCL 2 transition

Given:

- controller reaches RCL 2

Expected:

- colony detects the transition
- extension sites are planned
- builders complete them
- higher energy capacity results in stronger creep bodies

### Scenario D: RCL 3 transition

Given:

- controller reaches RCL 3

Expected:

- tower site is planned
- workers prioritize completing it
- completed tower attacks a hostile
- tower does not waste all energy repairing roads

### Scenario E: Expiring critical worker

Given:

- primary harvesting worker has low TTL
- spawn can afford a replacement

Expected:

- replacement is requested early
- duplicate replacements are not requested
- harvesting interruption is minimized

# Performance expectations

For one early colony:

- broad room searches should be centralized
- no unbounded arrays in memory
- no per-tick full layout recalculation
- no per-creep duplicate structure scans
- no logging per action
- no expensive path recalculation without reuse
- critical behavior must remain comfortably within the available CPU budget

Add lightweight CPU telemetry by subsystem when practical, but do not build a full observability platform yet.

# Deployment safety

The existing CI/CD harness remains authoritative.

Before claiming completion:

- Run all tests.
- Run typecheck.
- Run lint.
- Run the production build.
- Verify the release artifact.
- Do not deploy automatically unless the existing workflow is explicitly designed to deploy from this branch and all required conditions are met.
- Do not bypass production approval.
- Do not edit live code through the Screeps web editor.

Any new memory schema must remain backward-compatible with the currently deployed release whenever practical.

# Definition of done

This first gameplay step is complete when:

- The code automatically discovers and runs my owned starting room.
- A fresh room with no creeps and sufficient spawn energy bootstraps itself.
- Workers harvest, refill, build, repair selectively, and upgrade.
- The colony progresses through RCL 1, RCL 2, and RCL 3 without manual commands.
- Extensions are planned and constructed.
- A tower is planned at RCL 3 and behaves defensively.
- The colony replaces expiring workers.
- Total workforce loss triggers tested emergency recovery.
- The controller receives continuous progress when survival needs are met.
- The colony does not spam creeps, construction sites, repairs, or console logs.
- Room visuals show current health and release information.
- The existing runtime survival behavior remains functional.
- Memory is versioned and migration-tested.
- All automated checks pass.
- The final response reports:
  - architecture implemented
  - files added or changed
  - tests added
  - commands run
  - test results
  - expected live-game behavior
  - configuration values
  - known limitations
  - specific things I should watch after deployment

# Live verification checklist for me

Include this checklist in the final documentation so I can inspect the live room after deployment:

\[ \] Release SHA shown in room visual  
\[ \] No repeating exceptions in console  
\[ \] Owned room detected without hardcoded room name  
\[ \] Spawn creates a functional worker  
\[ \] Worker harvests from a source  
\[ \] Worker returns energy to spawn/extensions  
\[ \] Colony maintains a bounded workforce  
\[ \] Controller receives upgrades  
\[ \] Extension sites appear at RCL 2  
\[ \] Extensions are completed  
\[ \] Larger bodies appear as energy capacity increases  
\[ \] Tower site appears at RCL 3  
\[ \] Tower attacks a hostile automatically  
\[ \] Tower preserves an energy reserve  
\[ \] Expiring workers receive replacements  
\[ \] Killing all workers triggers emergency recovery  
\[ \] Emergency mode clears after recovery  
\[ \] Dead creep memory is cleaned up  
\[ \] Construction sites are not spammed  
\[ \] Workers do not spend all energy repairing roads or walls  
\[ \] CPU remains stable  
\[ \] Console logs describe state changes without tick-by-tick noise

# Important implementation constraints

- Protect the live colony above all else.
- Prefer simple, deterministic behavior over sophisticated AI.
- Do not implement advanced architecture prematurely.
- Preserve existing CI/CD and runtime protection.
- Do not hardcode my room name.
- Do not require me to operate the colony manually.
- Do not perform a live deployment unless the established workflow explicitly authorizes it.
- Do not claim behavior was observed live unless it was actually observed.
- Make reasonable assumptions, document them, and finish a narrow working vertical slice.