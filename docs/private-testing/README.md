# Screeps Private Testing

This directory tracks the local Screeps: World private testing initiative.

Current status: Slice T0/T1 guardrail foundation is implemented. T2 lifecycle
scaffolding is implemented with Docker Compose and verified to invoke Docker.
The first real `npm run screeps:start` attempt initialized the launcher data
directory but the server did not become ready because `screeps-launcher`
requires `STEAM_KEY`. Reset, seeding, local deployment, scenario execution, and
real private-server smoke tests are still pending.

## Confirmed Repository Context

- Node.js requirement: `package.json` requires Node `>=22`; current machine has Node `v24.16.0`.
- npm: current machine has npm `11.13.0`.
- Build artifact: `npm run build` writes `dist/main.js` and `dist/release-manifest.json`.
- Production deployment: `npm run deploy:candidate` and `npm run deploy:live` use `SCREEPS_TOKEN` through `scripts/screeps-api.mjs`.
- Test framework: Vitest through `npm test` and `npm run test:coverage`.
- Docker: current machine has Docker `29.5.3` and Docker Compose `v5.1.4`.
- Windows is the primary platform for this workspace. New harness scripts should be Node.js based or npm commands, not Bash-only scripts.

## Private Server Feasibility Notes

The official Screeps standalone server repository documents console startup with
`npm install screeps`, `npx screeps init`, and `npx screeps start`; it currently
requires Node.js 22 LTS or higher, Python 3, and build tools. The official
server also exposes a CLI on the backend CLI port, defaulting to `21026`.

The `screepers/screeps-launcher` project documents Docker and Docker Compose
usage and describes Docker Compose as the easiest Windows path for running a
private server with Mongo and Redis. It also manages its own Node installation
and supports CLI access with `screeps-launcher cli`.

Authentication is still a design constraint. The official server documents Steam
authentication or a Steam Web API key for headless auth. `screepsmod-auth`
provides username/password API login and CLI helpers such as
`auth.setPassword(username, password)` and token creation, but it must be
verified against the selected runtime before it becomes a committed dependency.

## Steam Web API Key

`STEAM_KEY` is a Steam Web API key used by the private Screeps server launcher
for Steam-backed server authentication. It is not the same as `SCREEPS_TOKEN`,
and it must not be committed.

To get one:

1. Sign in to Steam in a browser.
2. Open https://steamcommunity.com/dev/apikey.
3. Register a domain name for the key. For this local-only setup, use a local
   label such as `localhost`.
4. Copy the generated key into your local shell before starting the private
   server:

```powershell
$env:STEAM_KEY = "<your Steam Web API key>"
```

Then start the private server with the normal private-test guardrails:

```powershell
$env:SCREEPS_TARGET = "private"
$env:SCREEPS_PRIVATE_TESTING = "true"
npm run screeps:start
```

If Steam says your account is not eligible for a Web API key, use a Steam
account that meets Steam's Web API requirements.

## Current Guardrails

Private testing configuration is implemented in `src/private-testing/config.ts`.
It:

- defaults to `http://127.0.0.1:21025`
- requires `SCREEPS_TARGET=private` for private harness commands
- requires `SCREEPS_PRIVATE_TESTING=true` for destructive commands
- refuses known official Screeps endpoints
- ignores `SCREEPS_TOKEN` for private commands, so public deployment credentials
  can coexist in a repo-level `.env`
- keeps local credentials and state separate from production deployment settings

## Commands Added

Run private commands with `SCREEPS_TARGET=private` and
`SCREEPS_PRIVATE_TESTING=true`. A repo-level `.env` may contain both public
deployment settings such as `SCREEPS_TOKEN` and private settings, but private
commands only use `SCREEPS_PRIVATE_*` values and still refuse official Screeps
endpoints.

```powershell
$env:SCREEPS_TARGET = "private"
$env:SCREEPS_PRIVATE_TESTING = "true"
npm run screeps:status
npm run screeps:start
npm run screeps:reset
npm run screeps:seed
npm run screeps:hostiles -- melee-attacker
npm run screeps:deploy:local
npm run screeps:scenario -- melee-attacker
npm run test:screeps-smoke
npm run test:combat
npm run screeps:logs
npm run screeps:stop
```

Current real startup result:

- Docker Compose syntax validates.
- `npm run screeps:start` creates `.screeps-private/config.yml` and starts the
  `screepers/screeps-launcher` container.
- The launcher repeatedly exits before HTTP readiness when `STEAM_KEY` is
  absent.
- `npm run screeps:stop` removes the managed local container.
- `npm run screeps:deploy:local` builds `dist/main.js` and then attempts local
  auth/upload/verification against the private endpoint. With the server stopped,
  it exits nonzero with `Private Screeps server is unavailable at
  http://127.0.0.1:21025.`
- `npm run screeps:reset -- --print` and `npm run screeps:seed -- --print`
  print the deterministic private-server CLI scripts without requiring a running
  server.
- `npm run screeps:reset` and `npm run screeps:seed` pipe those scripts to
  `screeps-launcher cli` through Docker Compose. With the server stopped, reset
  exits nonzero with `service "screeps" is not running`.
- `npm run screeps:hostiles -- <scenario> --print` prints deterministic hostile
  fixture injection scripts from committed scenario JSON. Without `--print`, it
  pipes the hostile fixture script to `screeps-launcher cli`.
- `npm run screeps:scenario -- <name>`, `npm run test:screeps-smoke`, and
  `npm run test:combat` load the committed scenario definitions and write
  reports under `test-results/private-scenarios/`. When the private server is
  stopped, they fail nonzero quickly with a stopped-server report. When the
  private server is ready, they reset the test room, seed the owned baseline,
  deploy the local bot, inject scenario hostiles when required, then fail at the
  current state-collection boundary until real tick observation is implemented.

## Sources Checked

- Official server: https://github.com/screeps/screeps
- Screeps launcher: https://github.com/screepers/screeps-launcher
- Auth mod: https://github.com/screepsmods/screepsmod-auth
- Admin utils mod: https://github.com/ScreepsMods/screepsmod-admin-utils
