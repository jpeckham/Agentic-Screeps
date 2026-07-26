# Manual Prerequisites

This file records prerequisites that are not yet fully automated. Do not treat a
prerequisite as mandatory until the selected runtime slice proves it.

## Confirmed Local Tooling

- Node.js `v24.16.0` is installed on this machine.
- npm `11.13.0` is installed on this machine.
- Docker `29.5.3` is installed on this machine.
- Docker Compose `v5.1.4` is installed on this machine.

Verification commands:

```powershell
node --version
npm --version
docker --version
docker compose version
```

## Likely Runtime Prerequisites

The official `screeps` server package currently requires Node.js 22 LTS or
higher, Python 3, and build tools. This repository already requires Node 22+.

If Docker Compose is selected, the developer must have Docker Desktop installed
and running. Docker may also require virtualization to be enabled and local
firewall access for ports `21025` and `21026`.

## Authentication Prerequisites Verified For Docker Launcher

The Docker launcher path currently requires a Steam Web API key. A real
`npm run screeps:start` attempt on July 26, 2026 initialized the container and
then repeatedly logged:

```text
STEAM_KEY is not set, either set an environment variable or steamKey in the config.yml
Steam key can be obtained from https://steamcommunity.com/dev/apikey
```

Until this is automated or bypassed through a verified auth-only setup, set a
local environment variable before starting the server:

```powershell
$env:STEAM_KEY = "<local Steam Web API key>"
```

Do not commit the key. `.env` files remain ignored by Git.

For automated API deployment, the initiative still prefers `screepsmod-auth` if
it works with the selected runtime, because it provides username/password and
token helpers for private servers.

## Local Environment Marker

Destructive private-test commands must run with:

```powershell
$env:SCREEPS_TARGET = "private"
$env:SCREEPS_PRIVATE_TESTING = "true"
```

`SCREEPS_TARGET=private` selects the local private harness. A repo-level `.env`
may also contain `SCREEPS_TOKEN` for official-world deployment scripts; private
commands ignore that token and still refuse official endpoints.
