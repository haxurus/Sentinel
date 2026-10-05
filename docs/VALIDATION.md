# Validation

Every pull request runs `.github/workflows/ci.yml`. The deploy workflow calls the
same pipeline (`workflow_call`) and builds/pushes images only after it passes, so
nothing reaches the VPS untested.

## `test` job

1. `sh -n` on every shell script under `ops/`, `security/`, `deploy/` and `scripts/`;
2. `npm ci` from the committed `package-lock.json`;
3. Prisma client generation and a full build of all workspaces (TypeScript
   typecheck for shared/db/api/bot, `next build` for web, Discord capability
   policy static check for the bot);
4. unit tests (`npm test`, Node test runner + tsx): change detection, embed
   limits and formatting, capability policy, encryption/redaction, API helpers;
5. `prisma migrate deploy` against a fresh PostgreSQL 17;
6. `prisma migrate diff --exit-code`: migrations must match `schema.prisma`;
7. `deploy/runtime/harden-users.sh` on that database, then privilege checks:
   the bot role can write logs and read the install blacklist but cannot read
   panel/session/super-admin tables or modify the blacklist; the API role can
   use every application table but cannot create tables.

## `containers` job

1. `docker compose config` on the production Compose file;
2. `nginx -t` on the edge configuration with the pinned Nginx image;
3. Docker `runtime` and `migrate` target builds;
4. runtime smoke test: API, bot, web and Prisma client artifacts present and the
   image does not run as root.

## Notes

- `deploy/runtime/harden-users.sh` is the single source of the database
  hardening script; the local Compose file mounts the same file.
- Files under `deploy/`, `ops/` and `security/` are installed on the VPS by
  `ops/install-vps.sh` and are **not** updated by the application deploy.
- Deployment to the VPS remains disabled until the GitHub variable
  `ENABLE_VPS_DEPLOY` is set to `true`.
