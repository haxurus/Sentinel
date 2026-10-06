# Architecture

## Event flow

```text
Discord Gateway
    |
    v
apps/bot/src/handlers.ts
    |
    +--> MessageSnapshot, when applicable
    |
    v
LogEvent (PostgreSQL)
    |
    v
BullMQ / Redis
    |
    v
Dispatcher
    |
    +--> reads LogRoute
    +--> applies filters
    +--> generates embed
    v
Discord channel
```

The event is stored before delivery to Discord. `captureEnabled` controls collection into the database, while `enabled` separately controls delivery to the Discord channel. An error or rate limit while sending the embed does not lose history: BullMQ retries transient failures with backoff, while permanent Discord errors (missing access, unknown channel) are recorded immediately without retries. Embeds are trimmed to Discord's size limits before sending, and a log is never delivered to a channel outside the guild it came from. `LogEvent.dispatchState` stores the delivery outcome for diagnostics from the dashboard. Each `LogRoute` can also override retention, embed appearance, and visibility of the main fields.

## Dashboard

```text
Browser
  |
  v
Next.js
  |  /backend/*
  v
Fastify API
  +--> Discord OAuth2
  +--> Discord REST API
  +--> PostgreSQL
```

## Security

- Random 256-bit session token.
- Only an HMAC-SHA256 of the session token (keyed with `SESSION_SECRET`) is stored in the database; a new login rotates the session.
- HttpOnly, SameSite=Lax, and Secure cookies in production.
- OAuth2 `state` protection against login CSRF.
- API rate limiting per session (per client IP for anonymous requests).
- Security headers through Helmet.
- Authorization is enforced by the backend on every request, not only by the UI.
- IP addresses in the dashboard audit log are hashed with a server-side key.

## RBAC

Precedence is:

```text
OWNER > ADMIN > MODERATOR > VIEWER
```

The Discord server owner is recognized automatically. Administrator and Manage Server grant Admin access. Other users can access the dashboard if they have at least one Discord role mapped in the panel.

## Scalability

For a single community, the Docker Compose deployment is sufficient. If volume grows:

1. separate the BullMQ worker from the Gateway process;
2. use multiple dispatch workers;
3. partition `LogEvent` by date;
4. introduce Discord sharding;
5. move heavy exports to controlled asynchronous jobs;
6. use object storage for any authorized attachment copies.

Attachments are currently not downloaded: Sentinel stores only the metadata/URL received from Discord.
