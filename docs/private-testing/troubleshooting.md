# Private Testing Troubleshooting

## Missing Private Target

Private commands require the local harness target:

```powershell
$env:SCREEPS_TARGET = "private"
```

`SCREEPS_TOKEN` may remain present in `.env` for public deployment commands.
Private commands ignore it and continue to refuse official Screeps endpoints.

## Missing Local Marker

Private commands require:

```powershell
$env:SCREEPS_TARGET = "private"
$env:SCREEPS_PRIVATE_TESTING = "true"
```

## Server Does Not Become Ready

Check logs:

```powershell
npm run screeps:logs
```

The first Docker launcher run verified on July 26, 2026 did not become ready
without `STEAM_KEY`. The relevant log lines were:

```text
STEAM_KEY is not set, either set an environment variable or steamKey in the config.yml
Steam key can be obtained from https://steamcommunity.com/dev/apikey
```

Set a local `STEAM_KEY` environment variable or add `steamKey` to ignored local
launcher config before retrying.

## Local Deployment Cannot Connect

`npm run screeps:deploy:local` first runs the normal build and then contacts the
private endpoint. If the private server is stopped or not ready, expected output
ends with:

```text
Private Screeps server is unavailable at http://127.0.0.1:21025.
```

Start the server and confirm `npm run screeps:status` reports `"running": true`
before retrying local deployment.

## Reset Or Seed Says Service Is Not Running

`npm run screeps:reset` and `npm run screeps:seed` execute through Docker
Compose and require the managed private server container to be running. If the
server is stopped, Docker reports:

```text
service "screeps" is not running
Private server CLI exited with code 1.
```

Use `npm run screeps:start` first. If startup still fails, resolve the
`STEAM_KEY` prerequisite documented above.

## `test:combat` Fails Because Server Is Stopped

This is the current expected result until the private server reaches readiness:

```text
FAIL melee-attacker
  FAIL private server is not running
```

Reports are written under `test-results/private-scenarios/` and are ignored by
Git.

## Stop The Managed Server

```powershell
npm run screeps:stop
```

This removes the Docker Compose container for the
`agentic-screeps-private` project. It does not remove `.screeps-private/`.
