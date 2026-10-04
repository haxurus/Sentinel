# Security model

## Goal

Minimize attack surface, lateral movement, secret exposure, and the impact of a compromise of a single component.

## Trust boundaries

- `web`: no application secrets, access only to the internal API.
- `api`: OAuth, sessions, configuration, and log reads. It does not possess the bot's Discord token.
- `bot`: possesses the Discord token and can access only the tables required for logging.
- `postgres`: no published port; separate DB networks for API, bot, and migration.
- `redis`: visible only to the bot, authenticated, with no published port.
- `bot_rpc`: internal network shared only by API and bot; GET endpoints limited to server resources and access verification.

## Secrets

Secrets are files under `./secrets/` and are mounted at `/run/secrets`. They are not passed to the frontend and are not embedded directly into the Compose file.

Never store `./secrets` in the same backup as the database. Keep `log_data_encryption_key` separate from the PostgreSQL dump.

A full host compromise or root/Docker daemon access can still read mounted secrets. Never mount `/var/run/docker.sock` into project containers.

## Data encryption

Sensitive application data is encrypted with AES-256-GCM using a random nonce per record. The key is `log_data_encryption_key`.

Encrypted data includes:

- `LogEvent.details`;
- message content stored in snapshots;
- snapshot attachments/embeds;
- dashboard audit details;
- guild list stored in sessions.

IDs required for queries and relationships, timestamps, and operational summaries remain in plaintext.

Do not lose the key: encrypted data cannot be recovered without it.

## Database least privilege

`sentinel_api` can access the application tables required by the dashboard.

`sentinel_bot` can access only:

- `GuildSettings`;
- `LogRoute`;
- `LogEvent`;
- `MessageSnapshot`.

The bot has no access to dashboard sessions, RBAC bindings, or administrative audit data.

PostgreSQL owner credentials are used only by the one-shot `migrate` and `secure-db` jobs on an isolated network with no Internet egress.

## Web/API protections

- production `__Host-*` cookies;
- `Secure`, `HttpOnly`, `SameSite=Lax`;
- OAuth state compared in constant time;
- `Origin` checks on POST/PUT/PATCH/DELETE;
- global rate limiting;
- maximum body size of 32 KiB at the API and 64 KiB at the edge proxy;
- outbound timeouts toward Discord;
- Snowflake validation and `eventKey` allowlisting;
- HTTPS-only thumbnails;
- authenticated responses with `Cache-Control: no-store`;
- CSP, HSTS, anti-framing, `nosniff`, Referrer/Permissions Policy.

## Container isolation

For API, bot, and web:

- non-root user;
- `no-new-privileges`;
- `cap_drop: ALL`;
- read-only root filesystem;
- `/tmp` on tmpfs with `noexec` where possible;
- CPU, RAM, and PID limits;
- no API/DB/Redis ports published on the host.

## Egress and exfiltration

Absolute zero exfiltration cannot be guaranteed for the bot process: to work, it must receive data from Discord and have outbound connectivity to Discord. If that process were compromised, malicious code would simultaneously have access to Gateway data and to a network connection required by the service.

The configuration reduces impact as follows:

- the bot does not possess OAuth secrets or web sessions;
- the bot cannot read administrative tables;
- API and bot use separate DB networks and credentials;
- web has no sensitive secrets;
- no component can see host services outside its own Docker network, except for explicitly required Internet egress.

For a very high-security environment, add a host-firewall egress gateway/proxy with an allowlist for Discord services. This must be designed carefully because Discord uses dynamic endpoints and infrastructure, and a static IP block can break Gateway/WebSocket/API connectivity.

## Discord permissions

Do not grant `Administrator` to the bot. Grant only the permissions required in channels and `View Audit Log` when administrative action attribution is needed. Explicitly limit the channels where the bot can send messages.

## Backups

- encrypt backups of the PostgreSQL volume;
- do not include `./secrets` in the same archive;
- protect backups with strict filesystem permissions;
- test restore procedures regularly;
- rotate Discord tokens, OAuth secrets, and RPC keys after an incident.

## Host

Project security does not protect against an already compromised host. On the VPS, use at least:

- SSH key-only authentication;
- non-root administrative user with sudo;
- deny-by-default inbound firewall;
- automatic or regular security updates;
- Docker socket not exposed;
- encrypted filesystem/volume if the threat model includes disk theft;
- dashboard access restricted through VPN/reverse proxy where possible.

## Blocking host/LAN access

Production egress networks use the fixed bridges `sentinel-api-eg` and `sentinel-bot-eg`. On a Linux host with iptables, run:

```bash
sudo ./security/host-firewall.sh
```

The script blocks access from egress bridges to VPS services and private/link-local networks. It does not replace an egress proxy with a domain allowlist and cannot prevent compromised code from communicating with a public Internet host.

## Supply-chain and deployment security

- GitHub Actions does not receive Discord tokens, DB passwords, session secrets, or encryption keys.
- Images are deployed to the VPS by immutable `sha256` digest, not the `latest` tag.
- Builds publish BuildKit SBOM and provenance attestations.
- The `sentinel-deploy` SSH user uses a dedicated key with `restrict` and forced-command.
- The SSH wrapper accepts only `deploy`, `rollback`, and `status`; it does not provide a general-purpose shell.
- The privileged script and production Compose file are root-owned and are not automatically updated by GitHub.
- Infrastructure changes require a manual update with `sudo ./ops/install-vps.sh` after review.
- Before every deployment after the first one, a local root-only PostgreSQL dump is created.

This separates compromise of the repository/application from full administrative control of the VPS. An attacker with write access to `main` could still try to deploy malicious application code: for this reason, `main` must be protected with PRs, CI, reviews, and `production` environment protections.
