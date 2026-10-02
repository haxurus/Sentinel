#!/bin/sh
set -eu
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="backups/sentinel-audit-${stamp}.dump"
docker compose exec -T postgres sh -c 'export PGPASSWORD="$(cat /run/secrets/postgres_admin_password)"; exec pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$out"
chmod 600 "$out"
echo "Backup creato: $out"
