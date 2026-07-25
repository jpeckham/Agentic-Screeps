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
- `src/workforce` owns workforce target selection and balanced worker body
  construction.
- `src/creeps` owns worker mode transitions and deterministic work priorities.
- `src/construction` owns incremental early construction planning.
- `src/structures` owns tower priorities.
- `src/visualization` owns compact room status visuals.

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
- Treats low-TTL workers as replacement demand.
- Workers acquire energy from containers/storage when available, otherwise from
  sources.
- Loaded workers refill spawn/extensions/towers, build critical sites, prevent
  downgrade, build normal sites, upgrade, then perform bounded repairs.
- RCL 2 plans extensions incrementally.
- RCL 3 plans the first tower.
- Towers attack hostiles before healing or repair and preserve an energy reserve.
- Room visuals show RCL, mode, energy, workers, build sites, CPU, and release.

## Known Limitations

- A spawn with less than 200 stored energy and no living worker cannot recover.
- Construction placement is intentionally simple and local to the spawn; it is
  not a mature bunker planner.
- Roads, containers, and RCL 4 storage planning remain minimal.
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
