# Autonomous Colony

The first colony runtime discovers owned rooms automatically and runs a
conservative single-room RCL 1 through early RCL 3 controller. It preserves the
existing CI/CD, release tracking, memory migration, runtime safety, and survival
fallback behavior.

## Implemented Architecture

- `main.ts` runs memory migration, release activation logging, dead creep memory
  cleanup, `global.ai`, owned-room discovery, colony execution, and the existing
  survival fallback.
- `src/colony` owns room snapshots, durable colony state, console API, and the
  colony controller.
- `src/colony/strategy.ts` selects a context-specific colony strategy from the
  tick-local snapshot. The selected strategy supplies workforce sizing,
  construction priorities, worker builder limits, tower reserve policy, and the
  controller downgrade threshold used by workers.
- `src/workforce` owns workforce target selection and balanced worker body
  construction. Workforce sizing consumes the active strategy instead of using a
  single global heuristic.
- `src/creeps` owns worker mode transitions and deterministic work priorities.
- `src/construction` owns incremental early construction planning. Construction
  order and extension targets are strategy inputs.
- `src/structures` owns tower priorities.
- `src/visualization` owns compact room status visuals.

## Strategy Profiles

The current runtime keeps emergency handling as a hard override, then chooses a
named strategy for normal colony execution:

- `emergency-recovery`: no workers are available; keep spawning minimal and
  suppress nonessential construction pressure.
- `bootstrap`: RCL 1 with workers; keep the workforce small and prioritize
  survival plus controller progress.
- `balanced-early`: default RCL 2/RCL 3 early-room behavior.
- `infrastructure-push`: RCL 2 with meaningful extension construction demand;
  allows a larger workforce and more extension builders while still preserving
  controller progress.
- `controller-recovery`: controller downgrade risk is elevated; caps build
  pressure and shifts workers toward upgrading.
- `defensive-rcl3`: RCL 3 without a tower; prioritizes tower planning and tower
  completion.
- `early-rcl4`: early RCL 4 stabilization; allows the largest early-room
  workforce and continues incremental infrastructure.

Strategy changes are logged as `[colony W1N1] strategy selected: <name>` and the
latest selected strategy is stored in colony memory as a small string. Strategy
state is advisory and safe to recompute; no live Screeps objects are persisted.
The active strategy is also visible in room visuals and `ai.status()`.

## Configuration

Defaults live in `src/colony/config.ts`:

- `visualsEnabled: true`
- `statusLogInterval: 100`
- `emergencyTtlThreshold: 80`
- `replacementTtlThreshold: 180`
- `towerEnergyReserve: 500`
- `repairThreshold: 0.5`
- `roadRepairThreshold: 0.35`
- `wallStarterThreshold: 10000`
- `controllerEmergencyThreshold: 4000`
- `planningCadence: 50`
- `lowCpuBucket: 2000`

`ai.setVisuals(false)` disables room visuals. `ai.forceReplan(roomName)` marks a
colony for construction replanning.

## Current Behavior

- Finds owned rooms without a hardcoded room name.
- Initializes colony memory without wiping unrelated memory.
- Logs release activation once per release.
- Cleans dead creep memory.
- Spawns a `[WORK,CARRY,MOVE]` emergency worker when no viable workers exist and
  at least 200 energy is available.
- Maintains a bounded general worker workforce by RCL/source/construction demand.
- Selects an explicit colony strategy from current context instead of relying on
  one hardcoded room heuristic.
- Treats low-TTL workers as replacement demand.
- Workers acquire energy from containers/storage when available, otherwise from
  sources.
- Loaded workers refill spawn/extensions/towers, build critical sites, prevent
  downgrade, build normal sites, upgrade, then perform bounded repairs.
- Expiring workers receive tagged replacement spawns so duplicate replacement
  requests are avoided.
- RCL 2 plans extensions incrementally.
- RCL 3 plans the first tower.
- RCL 3 can plan source containers after extension and tower demand is handled.
- Early RCL 4 can plan storage after critical lower-RCL infrastructure is
  present.
- Towers attack hostiles before healing or repair and preserve an energy reserve.
- Visual telemetry failures are logged and do not stop colony execution.
- Room visuals show RCL, mode, energy, workers, active strategy, assignment
  counts, build sites, CPU, and release.
- Console status telemetry is interval-gated by `statusLogInterval` and records
  RCL, mode, energy, worker counts, assignment counts, construction site count,
  and CPU without logging every tick.
- `ai.status(roomName?)` reports the active strategy for manual inspection.
- Console lifecycle telemetry logs strategy transitions without logging every
  tick.
- Deterministic integration-style tests cover Scenario A through Scenario E from
  the implementation prompt: fresh RCL 1 bootstrap, total workforce death,
  RCL 2 transition, RCL 3 transition, and expiring worker replacement.

## Known Limitations

- A spawn with less than 200 stored energy and no living worker cannot recover.
- Construction placement is intentionally simple and local to the spawn; it is
  not a mature bunker planner.
- Roads remain minimal.
- Worker source balancing is simple and will need refinement for remote mining
  or high-traffic rooms.
- CPU telemetry is lightweight; there is no full observability platform.
- The implementation is a safe vertical slice, not a complete multi-room empire.

## Live Verification Checklist

- [ ] Release SHA shown in room visual
- [ ] No repeating exceptions in console
- [ ] Owned room detected without hardcoded room name
- [ ] Spawn creates a functional worker
- [ ] Worker harvests from a source
- [ ] Worker returns energy to spawn/extensions
- [ ] Colony maintains a bounded workforce
- [ ] Active strategy is visible in room visual or `ai.status()`
- [ ] Controller receives upgrades
- [ ] Extension sites appear at RCL 2
- [ ] Extensions are completed
- [ ] Larger bodies appear as energy capacity increases
- [ ] Tower site appears at RCL 3
- [ ] Tower attacks a hostile automatically
- [ ] Tower preserves an energy reserve
- [ ] Expiring workers receive replacements
- [ ] Killing all workers triggers emergency recovery
- [ ] Emergency mode clears after recovery
- [ ] Dead creep memory is cleaned up
- [ ] Construction sites are not spammed
- [ ] Workers do not spend all energy repairing roads or walls
- [ ] CPU remains stable
- [ ] Console logs describe state changes without tick-by-tick noise
