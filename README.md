# Sentinel

[![CI](https://github.com/haxurus/Sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/haxurus/Sentinel/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-f5a524)](LICENSE)

**Audit and logging for Discord servers, built to be verifiable.**

Sentinel watches what happens on a Discord server — bans, kicks, role and permission changes, edited and deleted messages, channels, invites, AutoMod and more — keeps an encrypted, searchable history and delivers each event to the log channel you choose. Everything is configured from a web dashboard.

- **Hosted instance:** [sentinel.haxurus.com](https://sentinel.haxurus.com) (installation currently limited to the project owner)
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
- [Super console and Premium](#super-console-and-premium)
- [Discord limitations](#discord-limitations)
- [Licence and contributing](#licence-and-contributing)

## Features

**76 event types**, each with its own logger:

| Area | Events |
|---|---|
| Members & moderation | join, leave, kick, ban, unban, nickname/role/timeout/boost changes, profile updates |
| Messages | create, edit (with previous content), delete (with snapshot), bulk delete, polls, reactions |
| Server structure | channels and permission overwrites, roles (permission diff), threads/forums, pins, invites, webhooks, integrations, server settings |
| Voice & activity | join, leave, move, mute/deaf/stream/video, Stage, scheduled events, soundboard, voice effects |
| Content | emoji, stickers |
| Automation & apps | AutoMod rules and actions, slash commands, application command permissions, Discord Audit Log |
| System & advanced | bot ready/errors/warnings, optional presence, typing and raw Gateway capture |

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

- **Read-only Discord capability policy.** The bot process allows only REST reads, posting log messages and leaving a server. Bans, kicks, timeouts, role/channel/message changes, webhooks and AutoMod changes are blocked in-process, regardless of the permissions given to the bot role. A build-time check (`policy:check`) rejects code that tries to bypass it.
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

Bot permissions (no `Administrator`): View Channels, Send Messages, Embed Links, Read Message History, View Audit Log.

OAuth2 redirect URL:

```text
https://<your-hostname>/backend/auth/discord/callback
```

To restrict who can install a hosted instance, set `INVITE_ALLOWED_USER_IDS` and also disable **Public Bot** and the default install link in the Developer Portal: the website check alone cannot stop a manually built OAuth URL.

## Super console and Premium

The instance owner (`SUPER_ADMIN_USER_ID`) has a global console to see connected servers, make the bot leave a server, blacklist servers or users, toggle Premium and review an audit log of these actions. Access is enforced by the API, not by hiding links.

High-volume loggers (message creation, reactions, presence, typing, raw Gateway, …) are available only on Premium servers. The restriction is enforced by the dashboard, the API, the recorder and the dispatcher; disabling Premium turns them off immediately and re-enabling it does not turn them back on automatically.

## Discord limitations

Sentinel records only what Discord exposes to the bot through the Gateway, REST and Audit Log with the granted intents and permissions. It cannot read private DMs between users, see what someone is viewing, or record voice audio. Attributing an action to a moderator relies on the Audit Log and may be missing when Discord does not provide an entry. Attachments are referenced by their Discord URL, not downloaded.

## Licence and contributing

Sentinel is free software released under the **GNU Affero General Public License v3.0 only** — see [`LICENSE`](LICENSE).

You may use, study, modify and self-host it. If you run a modified version as a service that other people use over a network, the AGPL requires you to offer them the corresponding source code of your version.

Issues and pull requests are welcome. Every pull request runs the full CI; changes to `deploy/`, `ops/`, `security/`, `.github/workflows/` and database migrations receive a manual review.

Copyright © 2026 Haxurus.
