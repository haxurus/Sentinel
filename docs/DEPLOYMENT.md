# GitHub -> VPS deployment

This procedure is intended for the production VPS with Docker Compose and Nginx Proxy Manager already installed. Sentinel does not publish the database, Redis, API, or dashboard directly on host ports.

## Deployment model

GitHub Actions builds two images:

- `runtime`: API, bot, and web;
- `migrate`: one-shot image for `prisma migrate deploy`.

Images are published to `ghcr.io/haxurus/sentinel`, and the VPS receives **immutable digest references** (`@sha256:...`).

SSH deployment uses the dedicated `sentinel-deploy` user. Its `authorized_keys` entry uses a forced-command and `restrict`, so it cannot open a shell, perform port forwarding, or run arbitrary commands.

## 1. Generate the GitHub Actions key

From a trusted machine:

```bash
ssh-keygen -t ed25519 -a 100 -f sentinel_deploy -C "sentinel-github-actions"
```

This creates:

- `sentinel_deploy` - **private**, to be stored only in GitHub Secrets;
- `sentinel_deploy.pub` - public, to be copied temporarily to the VPS for installation.

Do not reuse your personal administrative SSH key.

## 2. Install the Sentinel infrastructure on the VPS

### SSH preflight when using `AllowUsers`

If `sshd -T` shows an `AllowUsers` directive, explicitly add `sentinel-deploy` to the same directive before running the installer. Do not remove the restriction.

VPS01 example:

```text
AllowUsers user007 sentinel-deploy
```

Then validate and reload SSH without closing the current administrative session:

```bash
sudo sshd -t
sudo systemctl reload ssh
sudo sshd -T | grep '^allowusers'
```

The installer refuses to continue if it detects an `AllowUsers` policy that does not include `sentinel-deploy`.

Temporarily clone the repository and run the installer as root:

```bash
git clone https://github.com/haxurus/Sentinel.git /tmp/Sentinel
cd /tmp/Sentinel
sudo ./ops/install-vps.sh /path/to/sentinel_deploy.pub
```

The installer:

- creates `/srv/docker/sentinel` as root-only;
- creates the `sentinel-deploy` user;
- installs the SSH forced-command;
- installs the root-owned `/usr/local/sbin/sentinel-deploy`;
- creates random internal secrets;
- creates empty files for the Discord/OAuth tokens;
- installs the production Compose configuration;
- installs the persistent egress firewall;
- verifies that the Docker network `proxy_net` exists.

To update **only the static infrastructure** later, after reviewing it:

```bash
cd /tmp/Sentinel
git pull --ff-only
sudo ./ops/install-vps.sh
```

Without an argument, the existing deploy key is preserved.

## 3. Configure the VPS

Edit non-secret settings:

```bash
sudoedit /srv/docker/sentinel/.env
```

Example:

```dotenv
DISCORD_CLIENT_ID=123456789012345678
PUBLIC_BASE_URL=https://sentinel.example.com/backend
WEB_URL=https://sentinel.example.com
POSTGRES_ADMIN_USER=sentinel_owner
POSTGRES_DB=sentinel_audit
LOG_LEVEL=info
```

Enter the two Discord secrets without passing them on the command line:

```bash
sudoedit /srv/docker/sentinel/secrets/discord_token
sudoedit /srv/docker/sentinel/secrets/discord_client_secret
```

The remaining secrets are generated automatically by the installer.

Verify permissions:

```bash
sudo find /srv/docker/sentinel/secrets -maxdepth 1 -type f -printf '%m %u:%g %p\n'
```

`postgres_admin_password` remains `600 root:root`. Secrets read by the API/bot containers are `640 root:1000`: the `/srv/docker/sentinel/secrets` directory remains `700 root:root`, so normal host users cannot traverse it, while the non-root `node` process inside the containers (gid 1000) can read the secret bind mounts.

## 4. Configure Nginx Proxy Manager

The `edge` container joins the external Docker network `proxy_net` with the alias:

```text
sentinel-edge
```

Create a Proxy Host in Nginx Proxy Manager:

- Scheme: `http`
- Forward Hostname/IP: `sentinel-edge`
- Forward Port: `8080`
- Websockets: optional
- SSL: according to the policy already used on the VPS

NPM sees only the small edge proxy. The `web` container is not connected directly to `proxy_net` and receives no secrets.

## 5. Configure Discord OAuth2

In the Discord Developer Portal, add:

```text
https://sentinel.example.com/backend/auth/discord/callback
```

The value must match `PUBLIC_BASE_URL` exactly.

## 6. Configure GitHub

First create the GitHub **`production` environment**, restrict it to the `main` branch, and, when available, require at least one reviewer. Then add the following secrets **inside the `production` environment** (not as general repository secrets):

- `VPS_HOST` - VPS hostname or IPv4 address;
- `VPS_PORT` - normally `22`;
- `VPS_DEPLOY_KEY` - complete contents of the private `sentinel_deploy` key;
- `VPS_KNOWN_HOSTS` - verified SSH host key for the VPS.

For `VPS_KNOWN_HOSTS`, obtain the key directly from the VPS and build a verified known_hosts line. With port 22:

```text
vps.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
```

If an IP address is used in the `VPS_HOST` secret, the first column must contain that same IP. For non-standard ports, use `[host]:port` syntax.

Do not use `StrictHostKeyChecking=no`, and do not trust an unverified `ssh-keyscan` executed inside CI.

Also create the repository variable:

```text
ENABLE_VPS_DEPLOY=true
```

Until this variable is `true`, the workflow builds/pushes the images but does not contact the VPS.

### `production` environment

The `production` environment is a security boundary: it must allow deployment only from `main`. If supported by the GitHub plan in use, also require approval/reviewer. This prevents an arbitrary branch from automatically receiving the production SSH secrets.

## 7. GHCR

Images are published as Container packages in GitHub Container Registry.

Because the repository is public, the simplest setup is to make the `haxurus/sentinel` package public as well. In that case, the VPS can run `docker pull` without GitHub credentials.

If the package must remain private, log in to GHCR once on the VPS with a **read-only packages token**, and keep the Docker credentials only under the root account.

## 8. First deployment

After completing the previous steps, a push/merge to `main` starts:

1. runtime build;
2. migration image build;
3. BuildKit SBOM and provenance;
4. push to GHCR;
5. deployment of immutable digests;
6. pre-deploy DB backup if a database already exists;
7. migration;
8. health checks for API, bot, web, and edge.

If services do not become healthy within the expected window, the script attempts to restore the previous application image.

## 9. Rollback

From GitHub:

**Actions -> Rollback production -> Run workflow**

Or from the VPS:

```bash
sudo /usr/local/sbin/sentinel-deploy rollback
```

The script alternates between the current and previous releases recorded in root-only files.

### Migration note

Automatic rollback cannot magically reverse a destructive migration. Migrations must follow an expand/contract approach:

1. add compatible schema;
2. deploy new code;
3. migrate data if necessary;
4. remove obsolete columns/tables only in a later release, once rollback no longer depends on them.

Before every deployment after the first one, a PostgreSQL dump is stored in:

```text
/srv/docker/sentinel/backups/
```

with root-only permissions and a local retention of 14 days.

## 10. Recommended branch protection

Protect `main` in GitHub settings:

- require Pull Requests;
- require the `CI / validate` check;
- block force-pushes and branch deletion;
- require review conversations to be resolved;
- keep CODEOWNERS/review for sensitive changes.

Changes to `deploy/`, `ops/`, `security/`, `.github/workflows/`, and migrations should always receive manual review.
