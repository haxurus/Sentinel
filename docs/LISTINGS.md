# Bot directory listings

Copy for the public bot directories, ready to paste. Keep it in sync with the
product: plan limits live in `packages/shared/src/plans.ts`, features in the
README.

> Character limits change from site to site and over time: every description
> below states its length, so pick the variant that fits the form.

## Before submitting

- **Public Bot** must be enabled in the Discord Developer Portal, otherwise
  reviewers cannot add the bot.
- Privacy policy: https://sentinel.haxurus.com/en/legal#privacy
- Terms of service: https://sentinel.haxurus.com/en/legal#terms
- Most directories also ask for a **support server** invite.

## Common fields

| Field | Value |
|---|---|
| Name | Sentinel |
| Tagline (51) | Every action on your Discord server, on the record. |
| Library | discord.js (TypeScript) |
| Prefix / commands | None: everything is configured from the web dashboard |
| Website | https://sentinel.haxurus.com/en |
| Pricing | https://sentinel.haxurus.com/en/pricing |
| Dashboard | https://sentinel.haxurus.com/en/dashboard |
| Privacy policy | https://sentinel.haxurus.com/en/legal#privacy |
| Terms of service | https://sentinel.haxurus.com/en/legal#terms |
| Source code | https://github.com/haxurus/Sentinel |
| Licence | AGPL-3.0 (open source) |
| Contact | haxurus@icloud.com · Discord: haxurus |
| Languages | English, Italian (dashboard and log messages) |
| Invite URL | `https://discord.com/oauth2/authorize?client_id=1555694361059008665&scope=bot%20applications.commands&permissions=67194240` |

Permissions in the invite (no Administrator): View Channels, Send Messages,
Embed Links, Read Message History, View Audit Log, Change Nickname (used only
for the custom bot name of the Brand plan).

Privileged intents: Server Members, Message Content, Presence.

## Short descriptions

**97 characters**

> Discord audit log bot: track bans, kicks, role changes and deleted messages from a web dashboard.

**134 characters**

> Logs bans, kicks, timeouts, roles, permissions, edited and deleted messages, voice and AutoMod, with an encrypted, searchable history.

**199 characters**

> Sentinel is a Discord logging bot that records bans, kicks, timeouts, role and permission changes, edited and deleted messages, voice and AutoMod, with an encrypted, searchable history and dashboard.

## Long description (Markdown)

```markdown
# Sentinel — the Discord audit log bot

**Every action on your server, on the record.** Sentinel watches bans, kicks, timeouts, role and permission changes, edited and deleted messages, channels, invites, voice and AutoMod, keeps an encrypted and searchable history, and posts each event to the log channel you choose. Everything is configured from a web dashboard — no commands to learn.

## What it logs

- **Moderation:** bans, unbans, kicks and timeouts, with the moderator and the reason taken from Discord's Audit Log
- **Messages:** edits with the previous content, deletions with the original text and attachments, bulk deletes
- **Members:** joins, leaves, nicknames, roles, boosts and profile changes
- **Server structure:** channels and permission overwrites, roles (with a permission diff), threads, invites, webhooks, emoji, stickers and server settings
- **Voice & events:** joins, leaves, moves, mute/deafen/stream, Stage, scheduled events and soundboard
- **Automation:** AutoMod rules and actions, application command permissions

73 event types in total, each with its own logger.

## Why Sentinel

- **A log channel per event.** Send bans to one channel and deleted messages to another, mention a role only where it matters, ignore bots, users, roles or channels.
- **History you can search.** Every event is stored before it is posted, so a missing permission or a Discord outage never loses it. Filter by event, user, channel and date, and export to JSON.
- **Deleted messages, recovered.** Encrypted message snapshots let you see what a message said before it was edited or deleted.
- **Built to be safe.** No Administrator permission, and an internal read-only policy blocks every moderation action whatever role the bot has. Message content and event details are encrypted with AES-256-GCM.
- **Role-aware dashboard.** Sign in with Discord; Owner, Admin, Moderator and Viewer access is checked live against your server, and every change in the panel is audited.
- **Open source.** The full code is public under AGPL-3.0, and you can self-host it with Docker.

## Plans

Free includes every standard logger. Plus, Pro and Brand unlock high-volume loggers (new messages, reactions, presence, raw Gateway), longer history and higher limits; Brand adds a custom bot name and banner in your server. See https://sentinel.haxurus.com/en/pricing

## Getting started

1. Add Sentinel to your server.
2. Open https://sentinel.haxurus.com/en/dashboard and sign in with Discord.
3. Pick a default log channel and turn on the loggers you need.
```

## Per-directory notes

### top.gg

- Short description: the 134-character version.
- Long description: the Markdown above.
- Tags: Logging, Moderation, Utility, Web Dashboard, Security.
- Prefix: `none — configured from the web dashboard`.
- Add a few dashboard screenshots: logger list, history and an example log embed.

### discordbotlist.com

- Short description: the 97-character version.
- Long description: the Markdown above.
- Tags: logging, moderation, utility, dashboard, audit log.

### discord.bots.gg

- Short description: the 134-character version.
- Library: discord.js. Prefix: none.
- Long description: the Markdown above, plus the website and GitHub links.

### Discord App Directory (official)

Requires a verified application (Discord asks for verification once the bot is in 75+ servers) plus the privacy policy and terms links above.

- Short description: the 97-character version.
- Detailed description: the Markdown above without the H1 title.
- Categories: Moderation (primary), Utilities.
- Search tags: logging, audit log, moderation, logs, deleted messages.
- Links: website, privacy policy, terms of service, support server.

## Search keywords

Use naturally in descriptions and posts: Discord logging bot, Discord audit
log, moderation logs, message logs, deleted message logger, ban logs, mod log
bot, server logs, Discord logger.
