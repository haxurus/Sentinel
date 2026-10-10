# Sentinel

[![CI](https://github.com/haxurus/Sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/haxurus/Sentinel/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-f5a524)](LICENSE)

**Audit and logging for Discord servers, built to be verifiable.**

Sentinel watches what happens on a Discord server — bans, kicks, role and permission changes, edited and deleted messages, channels, invites, AutoMod and more — keeps an encrypted, searchable history and delivers each event to the log channel you choose. Everything is configured from a web dashboard.

- **Hosted instance:** [sentinel.haxurus.com](https://sentinel.haxurus.com) — in beta: servers join through a [waitlist](https://sentinel.haxurus.com/en/beta); plans on the [pricing page](https://sentinel.haxurus.com/en/pricing)
- **Self-hosting:** fork this repository and run it with Docker on your own infrastructure
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
- [Beta, plans and super console](#beta-plans-and-super-console)
- [Discord limitations](#discord-limitations)
- [Licence and contributing](#licence-and-contributing)

## Features

**73 event types**, each with its own logger:

| Area | Events |
|---|---|
| Members & moderation | join, leave, kick, ban, unban, nickname/role/timeout/boost changes, profile updates |
| Messages | create, edit (with previous content), delete (with snapshot), bulk delete, polls, reactions |
| Server structure | channels and permission overwrites, roles (permission diff), threads/forums, pins, invites, webhooks, integrations, server settings |
| Voice & activity | join, leave, move, mute/deaf/stream/video, Stage, scheduled events, soundboard, voice effects |
| Content | emoji, stickers |
| Automation & apps | AutoMod rules and actions, slash commands, application command permissions, Discord Audit Log |
| System & advanced | server availability, optional presence, typing and raw Gateway capture |

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
- **Encryption at rest.** Message content, attachments, embeds and event details are encrypted with AES-256-GCM.
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

Privileged Gateway intents — enable all three: the bot requests them at login and Discord rejects the connection if any is disabled, even when the related loggers are off.

- **Server Members Intent**
- **Message Content Intent**
- **Presence Intent**

Bot permissions (no `Administrator`): View Channels, Send Messages, Embed Links, Read Message History, View Audit Log, Change Nickname (used only for the Brand plan's custom name).

OAuth2 redirect URL:

```text
https://<your-hostname>/backend/auth/discord/callback
```

Who may keep the bot is enforced by the bot itself: when it joins a server it stays only if the server was approved (waitlist) or the person who added it may install anywhere (`SUPER_ADMIN_USER_ID` and `INVITE_ALLOWED_USER_IDS`); otherwise it leaves immediately and reports it in the status channel. To let approved beta servers install the bot, **Public Bot** must be enabled in the Developer Portal; keep the default install link disabled so the website remains the only entry point.

## Beta, plans and super console

**Beta waitlist.** Users sign in with Discord on `/beta` and request access for a server they manage (server ID and member count). The instance owner opens or closes sign-ups and approves or rejects requests from the super console; an approved server can then add the bot. Existing servers were authorised automatically when the beta started.

**Plans.** Every server has a plan, enforced by the dashboard, the API, the recorder (capture, daily quota, retention) and the dispatcher:

| | Free | Level 1 · Plus | Level 2 · Pro | Level 3 · Brand |
|---|---|---|---|---|
| Price | — | €2/month · €20/year | €5/month · €50/year | €10/month · €90/year |
| Standard loggers | ✓ | ✓ | ✓ | ✓ |
| High-volume loggers (messages, reactions, polls, interactions, Audit Log) | | ✓ | ✓ | ✓ |
| Advanced loggers (presence, typing, raw Gateway, diagnostics) | | | ✓ | ✓ |
| Retention | 15 days | 30 days | 60 days | 90 days |
| Events stored per day | 2,000 | 5,000 | 15,000 | 35,000 |
| Log channels | 3 | 8 | 20 | 20 |
| Priority support | | ✓ | ✓ | ✓ |
| Custom bot name and banner in the server | | | | ✓ |

The full list of limits lives in [`packages/shared/src/plans.ts`](packages/shared/src/plans.ts). When a plan is lowered or expires, loggers outside it are switched off and settings above its limits are clamped; nothing is deleted. Online payments are not enabled yet: the pricing page asks people to get in touch, and plans, expiry dates and coupons are managed by hand.

**Super console** (`SUPER_ADMIN_USER_ID` only, enforced by the API):

- connected servers with their plan (level, billing period, expiry, coupon, internal note), leave or block a server;
- waitlist switch, requests and public contact details;
- coupons and discounts (percentage or fixed amount, plans, billing period, validity, redemptions, optional promotion on the pricing page);
- the **status channel**: one server and channel, chosen among those the bot can see, that receives bot startup, errors, warnings, reached quotas and servers added, removed or rejected — these notices are no longer posted in individual servers;
- installation blacklist and an audit log of every action, including automatic plan expiries.

## Discord limitations

Sentinel records only what Discord exposes to the bot through the Gateway, REST and Audit Log with the granted intents and permissions. It cannot read private DMs between users, see what someone is viewing, or record voice audio. Attributing an action to a moderator relies on the Audit Log and may be missing when Discord does not provide an entry. Attachments are referenced by their Discord URL, not downloaded.

## Licence and contributing

Sentinel is free software released under the **GNU Affero General Public License v3.0 only** — see [`LICENSE`](LICENSE).

You may use, study, modify and self-host it. If you run a modified version as a service that other people use over a network, the AGPL requires you to offer them the corresponding source code of your version.

Issues and pull requests are welcome. Every pull request runs the full CI; changes to `deploy/`, `ops/`, `security/`, `.github/workflows/` and database migrations receive a manual review.

Copyright © 2026 Haxurus.
