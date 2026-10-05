# Sentinel

Sentinel is a self-hosted logging and auditing system for Discord with an administrative web dashboard. It records events available through the Discord Gateway/REST/Audit Log, keeps a searchable history, and can publish logs to configurable Discord channels.

> Production repository. No Discord token, database password, encryption key, or application secret must ever be stored on GitHub.

## Components

- `apps/bot` - Discord Gateway, message snapshots, recorder, dispatcher, and internal RPC.
- `apps/api` - Discord OAuth2, RBAC, configuration, search, export, and retention.
- `apps/web` - Next.js dashboard.
- `packages/db` - Prisma/PostgreSQL and migrations.
- `packages/shared` - shared event catalog.
- `deploy` - production Compose and edge configuration.
- `ops` - VPS installation, restricted deployment, and rollback.
- `security` - firewall rules and additional hardening.

## Main features

Sentinel includes **75 configurable event types**, including:

- member join, leave, kick, ban, unban, and member updates;
- message create/edit/delete and bulk delete;
- message snapshots, attachments, and metadata;
- reactions and polls;
- voice state and effects exposed by Discord;
- roles, channels, permission overwrites, and pins;
- threads/forums, emoji, stickers, and soundboard;
- invites, webhooks, and integrations;
- server updates, scheduled events, AutoMod, and Stage;
- interactions and application command permissions;
- Discord Audit Log;
- optional presence, typing, and raw Gateway events;
- bot system events.

Each logger separates **collection** from **Discord delivery**, so an event can be kept in history without producing messages in log channels.

## Security

The current version applies a zero-trust/least-privilege model:

- the Discord token is available only to the bot process;
- the API does not have the bot token;
- the frontend has no application secrets;
- runtime secrets are stored in root-only files on the VPS;
- sensitive application data is encrypted with AES-256-GCM;
- separate PostgreSQL users are used for API and bot;
- Redis is private and authenticated;
- Docker networks are segmented;
- container filesystems are read-only, non-root where applicable, with `cap_drop: ALL` and CPU/RAM/PID limits;
- secure cookies, CSRF Origin checks, CSP, HSTS, rate limiting, and input validation;
- no Docker socket is mounted;
- API/bot egress is separated and blocked from reaching host/LAN networks by the firewall;
- GitHub deployment uses a dedicated SSH account that **does not have an administrative shell** and can run only `deploy`, `rollback`, and `status` through a root-owned wrapper.

Details: [`docs/SECURITY.md`](docs/SECURITY.md).

## Discord capability policy

The bot process applies a runtime allowlist to Discord REST requests. Discord permissions assigned to the bot role **are not considered sufficient authorization** to perform a mutation.

Allowed:

- REST reads (`GET`), including channels, messages, members, roles, and Audit Log;
- receiving Gateway events;
- sending logs through `POST /channels/:channelId/messages`, including embeds;
- leaving a server through `DELETE /users/@me/guilds/:guildId`, used by the super console and blacklist enforcement.

Any other Discord `POST`, `PUT`, `PATCH`, or `DELETE` mutation is blocked by the process before reaching Discord. This includes, among other things:

- bans, kicks, timeouts, and member changes;
- message deletion or bulk delete;
- channel and role creation/modification/deletion;
- permission overwrites;
- server setting changes;
- webhook creation/modification/deletion;
- administrative AutoMod operations.

The bot build also runs `policy:check`, which tests allowed/blocked cases and rejects obvious bypasses such as direct Discord REST access, direct HTTP calls to the Discord API, or known high-level mutation methods.

## GitHub CI/CD -> VPS

Production deployment does not run `git pull` as root and does not build code on the VPS.

```text
Pull Request
    |
    v
GitHub CI -> Docker build

merge/push main
    |
    v
GitHub Actions
    |
    +--> build runtime image
    +--> build migration image
    +--> SBOM + provenance
    +--> push GHCR
    |
    v
SSH with dedicated key and forced-command
    |
    v
/srv/docker/sentinel
    |
    +--> pre-deploy DB backup
    +--> pull images by SHA-256 digest
    +--> migration
    +--> start stack
    +--> health check
    +--> app rollback if required
```

Application secrets **never pass through GitHub Actions**. GitHub only needs the VPS SSH deployment credentials, stored in the protected `production` environment.

Full guide: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Local development

Requirements:

- Node.js 22+
- Docker + Docker Compose
- a Discord test application

The project uses npm workspaces.

```bash
npm ci
npm run db:generate
npm run build
npm test
```

For the local/hardened Compose setup:

```bash
cp .env.example .env
mkdir -p secrets
# Populate the secrets as described in secrets/README.md
docker compose up -d --build
```

## Discord Developer Portal

Privileged Gateway Intents used by the project:

- Server Members Intent
- Presence Intent, if the presence logger is enabled
- Message Content Intent, if message content should be retained

Production OAuth2 redirect:

```text
https://<sentinel-hostname>/backend/auth/discord/callback
```

Recommended bot permissions, without `Administrator`:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- View Audit Log

Add only the additional permissions strictly required by the features that are actually enabled.

## Private installations during development

The hosted instance can restrict bot installation to an allowlist of Discord User IDs through:

```env
INVITE_ALLOWED_USER_IDS=123456789012345678
```

The install button requires Discord identification first. Users who are not in the allowlist are redirected to a page explaining that the project is still under development and linking to the repository/fork.

This website-side protection **does not replace** Discord's bot setting: during development, also set **Public Bot = OFF** in the Developer Portal and **Installation > Install Link = None**, so an unauthorized user cannot bypass the website by manually building an OAuth URL.

## Super console

The hosted instance includes a global super console reserved for the instance owner. Access control is enforced server-side against the Discord session.

Recommended explicit configuration:

```env
SUPER_ADMIN_USER_ID=123456789012345678
```

For compatibility with existing private installations, if `SUPER_ADMIN_USER_ID` is empty and `INVITE_ALLOWED_USER_IDS` contains **exactly one** ID, that account is used as the super admin. If the allowlist contains multiple accounts without an explicit super admin, the super console remains disabled.

The super console allows you to:

- view the live list of servers where the bot is connected;
- make the bot leave a server;
- blacklist servers, with immediate removal and automatic rejection on future joins;
- blacklist Discord User IDs from the hosted installation flow;
- remove entries from the blacklist;
- review a separate audit log of super-admin actions.

Super-console APIs always require the super-admin session; hiding the frontend link is not used as a security control.

## Premium and high-volume loggers

Servers are Free by default. Premium status can be changed only from the global super console.

Catalog events marked as `noisy` / **HIGH VOLUME** can be collected or sent to Discord only when `GuildSettings.premiumEnabled = true`.

Enforcement is applied at multiple layers:

- the dashboard disables high-volume logger controls on Free servers;
- the API rejects with `PREMIUM_REQUIRED` any attempt to enable collection or delivery of a `noisy` event on a Free server;
- the recorder does not persist `noisy` events for Free servers;
- the dispatcher does not send any `noisy` events that remain queued after Premium is disabled;
- disabling Premium from the super console immediately turns off all `noisy` loggers, as well as Presence, Typing, and raw Gateway logging.

Re-enabling Premium **does not automatically re-enable** high-volume loggers: they must be enabled manually from the server dashboard.

## Database and retention

- PostgreSQL stores configuration, events, snapshots, and dashboard audit data.
- Redis/BullMQ manages the Discord delivery queue.
- Production migrations use `prisma migrate deploy`.
- Default retention: 30 days, configurable.
- Dashboard sessions expire after 8 hours.

Migrations must be **backward-compatible** with at least one previous release to keep application rollback safe. Destructive removals must be performed in a later release.

## Discord limitations

Sentinel can record only what Discord makes available to the bot through Gateway, REST, and Audit Log with the granted intents and permissions. It cannot read private DMs between users, know what a person is viewing in the client, or automatically record voice conversation audio through normal Gateway events.

## Operations

Production status from the VPS:

```bash
sudo /usr/local/sbin/sentinel-deploy status
```

Manual rollback:

```bash
sudo /usr/local/sbin/sentinel-deploy rollback
```

Alternatively, the GitHub Actions **Rollback production** workflow is available.

## Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/VALIDATION.md`](docs/VALIDATION.md)
