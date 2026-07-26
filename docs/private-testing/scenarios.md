# Scenario Assertions

Scenario execution is not implemented yet. The assertion engine foundation is
implemented in `src/private-testing/assertions.ts`, scenario validation/loading
is implemented in `src/private-testing/scenarios.ts`, and report writing is
implemented in `src/private-testing/reporter.ts`.

## Observation Model

Assertions evaluate ordered observations:

```ts
interface ScenarioObservation {
  tick: number;
  state: Record<string, unknown>;
  runtimeExceptions: string[];
}
```

Scenario collectors will populate `state` from private-server room state and
bot telemetry. Dotted paths such as `tower.action` and `posture` are supported.

## Bot Telemetry

The bot writes compact test telemetry only when local private testing explicitly
sets:

```ts
Memory.config.privateTestingEnabled = true;
```

The observation object is namespaced under `Memory.testing`:

```ts
Memory.testing = {
  tick: Game.time,
  colonies: {
    E1S1: {
      threat: "MEDIUM",
      posture: "ENGAGE",
      hostileCount: 1,
      selectedTargetId: "attacker-1",
      selectedTargetName: "attacker-1",
      tower: { action: "attack" }
    }
  }
};
```

The collector in `src/private-testing/state-collector.ts` converts this memory
shape into scenario observations and includes runtime failure messages.
`src/private-testing/memory-observation-provider.ts` wires that collector to the
authenticated private API Memory reader in `LocalScreepsClient`.

## Implemented Assertion Categories

- `equals`: latest observed value equals the expected value.
- `oneOf`: latest observed value is one of the expected values.
- `becomesTrueWithin`: path becomes `true` within N ticks from the first observation.
- `remainsUnchanged`: path remains unchanged across the latest N-tick observation window.
- `exists`: path is observed as a non-null value.
- `notExists`: path is never observed as a non-null value.
- `hitPointsDecreased`: numeric hit-point value decreases after its first observation.
- `postureTransition`: path transitions from one posture to another within N ticks.
- `noRuntimeException`: no observation records a runtime exception.

## Scenario Definitions

Initial committed definitions live under `test/scenarios/definitions/`:

- `healer-and-attacker`
- `melee-attacker`
- `no-hostile-baseline`
- `threat-disappears`
- `unarmed-scout`

Scenario JSON is data-only. It supports:

- `name`
- `description`
- `initialState.baseline`, currently only `owned-colony`
- `durationTicks`
- `hostileCreeps`
- `assertions`

Hostile fixtures support deterministic `name`, `body`, `roomName`, `x`, `y`,
optional `hits`, and optional `action`. Supported actions are `hold`,
`approachSpawn`, and `attackSpawn`.

`src/private-testing/hostile-injection.ts` converts these fixtures into a
validated private-server CLI script. The script ensures the local enemy user
exists, removes prior matching hostile creep records in the scenario room, and
inserts hostile creep room objects with deterministic ids and hit points.

Use print mode to inspect a hostile fixture script without requiring a running
server:

```powershell
npm run screeps:hostiles -- melee-attacker --print
```

Without `--print`, the command pipes the script to `screeps-launcher cli`
through Docker Compose.

## Reports

`writeScenarioReport` writes:

- a human-readable `.txt` report
- a machine-readable `.json` report

Reports are intended to be written under `test-results/`, which is ignored by
Git.

The current CLI wrapper writes reports under `test-results/private-scenarios/`.
With the private server stopped, each report contains a single failed assertion:
`private server is not running`.

## Pending Work

- CLI polling across scenario duration.
- Tick advancement/observation waiting.
- JSON report creation from real multi-tick scenario executions.
- Hostile action behavior beyond static fixture metadata.
- Scenario cleanup and `--keep-world` behavior.

## Baseline World

The owned-colony baseline is defined in `src/private-testing/world-seeder.ts`.
It currently targets room `E1S1` with:

- controller at RCL3
- one spawn
- one tower
- five extensions
- two sources
- flat generated terrain

The real server mutation path is `npm run screeps:reset`, followed by
`npm run screeps:seed`, followed by `npm run screeps:hostiles -- <scenario>`
for hostile scenarios. Use `-- --print` with any of these commands to inspect
the CLI script without requiring a running private server.
