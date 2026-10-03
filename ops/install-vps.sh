#!/bin/sh
set -eu

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
STATE_DIR=/srv/docker/sentinel
DEPLOY_USER=sentinel-deploy
KEY_FILE=${1:-}

log() { printf '[sentinel-install] %s\n' "$*"; }
die() { printf '[sentinel-install] ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die 'run with sudo/root'
command -v docker >/dev/null 2>&1 || die 'Docker is required'
command -v openssl >/dev/null 2>&1 || die 'OpenSSL is required'
command -v visudo >/dev/null 2>&1 || die 'sudo/visudo is required'
docker compose version >/dev/null 2>&1 || die 'Docker Compose plugin is required'

# Do not silently weaken an existing SSH AllowUsers policy. If the host already
# restricts SSH users, the administrator must explicitly add sentinel-deploy.
if command -v sshd >/dev/null 2>&1; then
  allow_users=$(sshd -T 2>/dev/null | awk '$1 == "allowusers" { for (i=2; i<=NF; i++) print $i }' || true)
  if [ -n "$allow_users" ] && ! printf '%s\n' "$allow_users" | grep -Fxq "$DEPLOY_USER"; then
    die "sshd AllowUsers is active but does not include $DEPLOY_USER; add it to the existing AllowUsers directive, validate with 'sshd -t', reload ssh, then rerun this installer"
  fi
fi

deploy_key=''
if [ -n "$KEY_FILE" ]; then
  [ -f "$KEY_FILE" ] || die 'deploy public key file not found'
  deploy_key=$(cat "$KEY_FILE")
  printf '%s\n' "$deploy_key" | grep -Eq '^ssh-ed25519 [A-Za-z0-9+/=]+' || die 'only an Ed25519 deploy public key is accepted'
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/sentinel-deploy --shell /bin/sh "$DEPLOY_USER"
fi

install -d -o root -g root -m 700 "$STATE_DIR" "$STATE_DIR/secrets" "$STATE_DIR/runtime" "$STATE_DIR/backups"
install -o root -g root -m 600 "$REPO_DIR/deploy/docker-compose.prod.yml" "$STATE_DIR/docker-compose.yml"
install -o root -g root -m 644 "$REPO_DIR/deploy/runtime/nginx.conf" "$STATE_DIR/runtime/nginx.conf"
install -o root -g root -m 755 "$REPO_DIR/deploy/runtime/harden-users.sh" "$STATE_DIR/runtime/harden-users.sh"
install -o root -g root -m 755 "$REPO_DIR/ops/sentinel-deploy" /usr/local/sbin/sentinel-deploy
install -d -o root -g root -m 755 /usr/local/libexec
install -o root -g root -m 755 "$REPO_DIR/ops/sentinel-deploy-entrypoint" /usr/local/libexec/sentinel-deploy-entrypoint
install -o root -g root -m 755 "$REPO_DIR/security/host-firewall.sh" /usr/local/sbin/sentinel-egress-firewall.sh

if [ ! -f "$STATE_DIR/.env" ]; then
  install -o root -g root -m 600 "$REPO_DIR/deploy/.env.production.example" "$STATE_DIR/.env"
  log "created $STATE_DIR/.env from template; edit it before first deploy"
fi

umask 077
secret_if_missing() {
  file="$STATE_DIR/secrets/$1"
  generator="$2"
  if [ ! -s "$file" ]; then
    sh -c "$generator" > "$file"
    chown root:root "$file"
    chmod 600 "$file"
  fi
}
secret_if_missing session_secret "openssl rand -base64 48 | tr -d '\\n'"
secret_if_missing bot_internal_api_key "openssl rand -base64 48 | tr -d '\\n'"
secret_if_missing log_data_encryption_key "openssl rand -base64 32 | tr -d '\\n'"
for name in postgres_admin_password api_db_password bot_db_password redis_password; do
  secret_if_missing "$name" "openssl rand -hex 32 | tr -d '\\n'"
done
for name in discord_token discord_client_secret; do
  file="$STATE_DIR/secrets/$name"
  if [ ! -e "$file" ]; then
    install -o root -g root -m 600 /dev/null "$file"
  fi
done

# Docker Compose local file secrets are bind-mounted with their host ownership
# and mode. The runtime image intentionally runs as the non-root "node" user
# (uid/gid 1000), so secrets consumed by API/bot must be group-readable by
# that numeric gid. The parent state/secrets directories remain root-only.
for name in discord_token discord_client_secret session_secret log_data_encryption_key bot_internal_api_key api_db_password bot_db_password redis_password; do
  file="$STATE_DIR/secrets/$name"
  chown root:1000 "$file"
  chmod 640 "$file"
done
chown root:root "$STATE_DIR/secrets/postgres_admin_password"
chmod 600 "$STATE_DIR/secrets/postgres_admin_password"

home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 700 "$home/.ssh"
if [ -n "$deploy_key" ]; then
  printf 'restrict,command="/usr/local/libexec/sentinel-deploy-entrypoint" %s\n' "$deploy_key" > "$home/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$home/.ssh/authorized_keys"
  chmod 600 "$home/.ssh/authorized_keys"
elif [ ! -s "$home/.ssh/authorized_keys" ]; then
  die 'first install requires the deploy public key: sudo ./ops/install-vps.sh /path/to/sentinel_deploy.pub'
fi

cat > /etc/sudoers.d/sentinel-deploy <<'SUDOEOF'
Defaults:sentinel-deploy !setenv
sentinel-deploy ALL=(root) NOPASSWD: /usr/local/sbin/sentinel-deploy *
SUDOEOF
chmod 440 /etc/sudoers.d/sentinel-deploy
visudo -cf /etc/sudoers.d/sentinel-deploy >/dev/null

cat > /etc/systemd/system/sentinel-firewall.service <<'UNITEOF'
[Unit]
Description=Sentinel Docker egress firewall
Requires=docker.service
After=docker.service docker-firewall.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/sentinel-egress-firewall.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable sentinel-firewall.service >/dev/null
systemctl restart sentinel-firewall.service

if ! docker network inspect proxy_net >/dev/null 2>&1; then
  die 'Docker network proxy_net does not exist; Nginx Proxy Manager network is required'
fi

log 'installation complete'
log "edit $STATE_DIR/.env"
log "fill $STATE_DIR/secrets/discord_token and discord_client_secret"
log 'configure Nginx Proxy Manager to forward the Sentinel hostname to sentinel-edge:8080'
