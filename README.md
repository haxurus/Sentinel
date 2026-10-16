# Sentinel — Discord logging & audit log bot

[![CI](https://github.com/haxurus/Sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/haxurus/Sentinel/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-f5a524)](LICENSE)

**An open-source Discord logging bot for audit logs, moderation logs and message logs, built to be verifiable.**

Sentinel watches what happens on a Discord server — bans, kicks, role and permission changes, edited and deleted messages, channels, invites, AutoMod and more — keeps an encrypted, searchable history and delivers each event to the log channel you choose. Everything is configured from a web dashboard.

**[Add to Discord](https://sentinel.haxurus.com/backend/bot/invite)** · [Website](https://sentinel.haxurus.com/en) · [Pricing](https://sentinel.haxurus.com/en/pricing) · [Support server](https://discord.gg/DDBGWP5fMX) · [Privacy & terms](https://sentinel.haxurus.com/en/legal)

- **Hosted instance:** [sentinel.haxurus.com](https://sentinel.haxurus.com) — open to every server, with a free plan
- **Self-hosting:** run your own copy with Docker — see the [distribution rules](docs/DISTRIBUTION.md)
- **Open source:** the bot, the API, the dashboard and the deployment scripts are all in this repository under the [AGPL-3.0](LICENSE) licence

> No Discord token, database password, encryption key or other secret is ever stored in this repository.

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Security model](#security-model)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Self-hosting and deployment](#self-hosting-and-deployment)
- [Discord application setup](#discord-application-setup)
- [Plans and super console](#plans-and-super-console)
- [Discord limitations](#discord-limitations)
- [Support and contributing](#support-and-contributing)
- [Licence and distribution](#licence-and-distribution)

## Features

**70 event types**, each with its own logger:

| Area | Events |
|---|---|
| Members & moderation | join, leave, kick, ban, unban, nickname/role/timeout/boost changes, profile updates |
| Messages | create, edit (with previous content), delete (with snapshot), bulk delete, polls, reactions |
| Server structure | channels and permission overwrites, roles (permission diff), threads/forums, pins, invites, webhooks, integrations, server settings |
| Voice & activity | join, leave, move, mute/deaf/stream/video, Stage, scheduled events, soundboard, voice effects |
| Content | emoji, stickers |
| Automation & apps | AutoMod rules and actions, slash commands, application command permissions, Discord Audit Log |
| System | server availability and Gateway diagnostics |

**Per-logger control**

- *Collection* (store in history) and *delivery* (post to Discord) are independent: keep a full history without flooding channels.
- Destination channel, custom title/footer/colour/thumbnail, role mentions, retention override.
- Exceptions by user, role and channel; optional "ignore bots".
- The moderator behind an action is resolved from the Discord Audit Log.
- Noise is filtered at the source: role reordering, link-preview refreshes, unchanged updates and pre-existing threads are not logged.

**Dashboard**

- Discord sign-in, access levels **Owner / Admin / Moderator / Viewer** verified live against the server, role-based access mapping.
- Overview with daily volume and delivery issues, logger configuration grouped by area, searchable and paginated history with delivery state per event, JSON export (decrypted, streamed).
- Panel audit log, per-user data deletion, English and Italian interface, per-server embed language.

## How it works

```text
Discord Gateway ──► bot handlers ──► LogEvent (PostgreSQL, encrypted details)
                         │                    │
                         └─► message snapshot  ▼
                                        BullMQ queue (Redis)
                                              │
                                              ▼
                     dispatcher: route lookup ─► filters ─► embed (size-safe) ─► Discord channel
```

Events are stored **before** delivery: a Discord outage or a missing permission never loses history. Every event records its delivery outcome (`SENT`, `FILTERED`, `CHANNEL_UNAVAILABLE`, `FAILED`, …), visible in the dashboard. Permanent Discord errors are not retried; transient ones are retried with backoff.

```text
Browser ──► Next.js (web) ──/backend/*──► Fastify API ──► PostgreSQL
                                              │
                                              └─internal RPC─► bot (live Discord permissions)
```

More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Security model

A logging bot sees a lot, so Sentinel is designed to limit what a compromised component could do.

- **Read-only Discord capability policy.** The bot process allows only REST reads, posting log messages, leaving a server and changing its own nickname and banner in a server (Brand plan; any other member field is rejected). Bans, kicks, timeouts, role/channel/message changes, webhooks and AutoMod changes are blocked in-process, regardless of the permissions given to the bot role. A build-time check (`policy:check`) rejects code that tries to bypass it.
- **Separated secrets.** The Discord token exists only in the bot container; the web container has no application secrets; secrets live in root-only files on the host.
- **Encryption at rest.** Message content, attachments, embeds, event details and summaries, and message authors are encrypted with AES-256-GCM, also inside database backups. `sentinel-deploy` can additionally encrypt whole backups with age (see the deployment guide).
- **Data minimisation.** No online status, activities or typing are recorded. History expires with the plan's retention, and when the bot is removed from a server all of that server's data and settings are deleted 30 days later unless it is added back.
- **Least-privilege database.** Distinct PostgreSQL roles for API and bot; the bot cannot read sessions, panel audit or super-admin tables. CI verifies these grants on every change.
- **Isolation.** Segmented Docker networks, private authenticated Redis, read-only non-root containers with `cap_drop: ALL` and resource limits, no Docker socket, egress blocked towards host/LAN.
- **Web hardening.** HttpOnly/Secure session cookies (HMAC-hashed in the database, rotated on login), OAuth `state`, Origin-based CSRF checks, strict CSP, per-session rate limiting, input validation, guild ownership checks on every channel/role ID.
- **Restricted deployment.** GitHub Actions reaches the VPS through a dedicated SSH key with a forced command that can only run `deploy`, `rollback` and `status`; images are deployed by immutable SHA-256 digest.

Details: [`docs/SECURITY.md`](docs/SECURITY.md). To report a vulnerability, see [`SECURITY.md`](SECURITY.md).

## Repository layout

| Path | Contents |
|---|---|
| `apps/bot` | Discord Gateway client, handlers, recorder, dispatcher, capability policy, internal RPC |
| `apps/api` | Fastify API: OAuth2, sessions, RBAC, configuration, history, export, super console |
| `apps/web` | Next.js dashboard and public site |
| `packages/db` | Prisma schema and migrations (PostgreSQL) |
| `packages/shared` | Event catalog shared by bot, API and web |
| `deploy` | Production Compose file, edge Nginx config, database role hardening |
| `ops` | VPS installer, restricted deploy wrapper, SSH forced-command entrypoint |
| `security` | Host firewall rules |
| `docs` | Architecture, security, deployment and validation guides |

## Local development

Requirements: Node.js 22+, Docker with Compose, a Discord test application.

```bash
npm ci
npm run db:generate
npm run build
npm test
```

Full local stack with the same hardening as production:

```bash
cp .env.example .env
mkdir -p secrets
# create the secret files described in secrets/README.md
docker compose up -d --build
```

## Self-hosting and deployment

Production runs as immutable Docker images built by GitHub Actions; nothing is built or `git pull`ed on the server.

```text
pull request ──► CI: build + typecheck, unit tests, migrations on PostgreSQL,
                     database privilege checks, Compose/Nginx validation, image build

merge to main ──► same CI ──► build & push images (SBOM + provenance) to GHCR
              ──► SSH forced command on the VPS:
                    disk-space guard ─► database backup ─► pull by digest ─► migrate
                    ─► start ─► health checks ─► automatic rollback on failure
                    ─► prune images older than the previous release
```

Step-by-step guide (VPS install, reverse proxy, OAuth, GitHub secrets, rollback): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). What CI verifies: [`docs/VALIDATION.md`](docs/VALIDATION.md).

Useful commands on the VPS:

```bash
sudo /usr/local/sbin/sentinel-deploy status
sudo /usr/local/sbin/sentinel-deploy rollback
```

Rollback is also available as the **Rollback production** GitHub Actions workflow. Migrations must stay backward-compatible with the previous release (expand/contract) so that rollback remains safe.

## Discord application setup

Privileged Gateway intents — enable both: the bot requests them at login and Discord rejects the connection if either is disabled.

- **Server Members Intent**
- **Message Content Intent**

The Presence Intent is not used: Sentinel never records members' online status or activities.

Bot permissions (no `Administrator`): View Channels, Send Messages, Embed Links, Read Message History, View Audit Log, Change Nickname (used only for the Brand plan's custom name).

OAuth2 redirect URL:

```text
https://<your-hostname>/backend/auth/discord/callback
```

Anyone can add the hosted bot: **Public Bot** must be enabled in the Developer Portal. The bot still leaves servers, and servers added by users, that are on the super console blacklist, and reports it in the status channel.

## Plans and super console

**Plans.** Every server has a plan, enforced by the dashboard, the API, the recorder (capture, daily quota, retention) and the dispatcher:

| | Free | Level 1 · Plus | Level 2 · Pro | Level 3 · Brand |
|---|---|---|---|---|
| Price | — | €1.99/month · €19.99/year | €4.99/month · €49.99/year | €8.99/month · €89.99/year |
| Standard loggers | ✓ | ✓ | ✓ | ✓ |
| High-volume loggers (messages, reactions, polls, interactions, Audit Log) | | ✓ | ✓ | ✓ |
| Gateway diagnostics and server availability loggers | | | ✓ | ✓ |
| Retention | 15 days | 30 days | 60 days | 90 days |
| Events stored per day | 2,000 | 5,000 | 15,000 | 25,000 |
| Log channels | 3 | 8 | 20 | 20 |
| Priority support | | ✓ | ✓ | ✓ |
| Custom bot name and banner in the server | | | | ✓ |

The full list of limits lives in [`packages/shared/src/plans.ts`](packages/shared/src/plans.ts). When a plan is lowered or expires, loggers outside it are switched off and settings above its limits are clamped; nothing is deleted.

**Payments.** Paid plans are sold only as **Discord Premium Apps guild subscriptions**, at the same prices as the pricing page, as the [Discord Developer Policy](https://support-dev.discord.com/hc/articles/8563934450327-Discord-Developer-Policy) requires. There are no coupons or multi-server discounts, because Discord could not offer the same price. The SKU IDs are set in the super console; every two minutes the API reads the application's active entitlements through the bot (a read-only REST call) and updates each server's plan: a purchase switches the plan on, a renewal extends it and an ended subscription brings the server back to Free. If the entitlements cannot be read, nothing changes. Until SKUs are configured the pricing page shows the plans as "coming soon on Discord".

**Super console** (`SUPER_ADMIN_USER_ID` only, enforced by the API):

- connected servers with their plan (level, source — Discord subscription or manual —, expiry, internal note), leave or block a server; manual plans are free trials, partner or complimentary plans;
- public contact details shown on the pricing page;
- **Discord subscriptions**: the SKU ID of each plan and billing period, the last sync and a manual "sync now";
- the **status channel**: one server and channel, chosen among those the bot can see, that receives bot startup, errors, warnings, reached quotas and servers added, removed or rejected — these notices are no longer posted in individual servers;
- installation blacklist and an audit log of every action, including automatic plan expiries.

## Discord limitations

Sentinel records only what Discord exposes to the bot through the Gateway, REST and Audit Log with the granted intents and permissions. It cannot read private DMs between users, see what someone is viewing, or record voice audio. Attributing an action to a moderator relies on the Audit Log and may be missing when Discord does not provide an entry. Attachments are referenced by their Discord URL, not downloaded.

## Support and contributing

- **Questions and help:** the [Discord server](https://discord.gg/DDBGWP5fMX) — see [SUPPORT.md](.github/SUPPORT.md).
- **Bugs and feature requests:** [open an issue](https://github.com/haxurus/Sentinel/issues/new/choose) using the forms.
- **Security vulnerabilities:** report them [privately](https://github.com/haxurus/Sentinel/security/advisories/new), never in a public issue — see [SECURITY.md](SECURITY.md).
- **Pull requests:** read [CONTRIBUTING.md](.github/CONTRIBUTING.md) first, including the project scope. Every pull request runs the full CI.

Everyone taking part follows the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Licence and distribution

Sentinel is free software released under the **GNU Affero General Public License v3.0 only** — see [`LICENSE`](LICENSE).

You may use, study, modify and self-host it. If you offer a modified version to other people over a network, the AGPL requires you to give them the source code of your version; public instances must also use their own name and branding. The details are in [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

Copyright © 2026 Haxurus.
