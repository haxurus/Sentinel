#!/bin/sh
set -eu
: "${PGHOST:?}" "${PGDATABASE:?}" "${PGUSER:?}" "${POSTGRES_ADMIN_PASSWORD_FILE:?}" "${API_DB_PASSWORD_FILE:?}" "${BOT_DB_PASSWORD_FILE:?}"
export PGPASSWORD="$(cat "$POSTGRES_ADMIN_PASSWORD_FILE")"
API_DB_PASSWORD="$(cat "$API_DB_PASSWORD_FILE")"
BOT_DB_PASSWORD="$(cat "$BOT_DB_PASSWORD_FILE")"

psql -v ON_ERROR_STOP=1 -v api_password="$API_DB_PASSWORD" -v bot_password="$BOT_DB_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE sentinel_api LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_api') \gexec
SELECT 'CREATE ROLE sentinel_bot LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_bot') \gexec
SELECT format('ALTER ROLE sentinel_api PASSWORD %L', :'api_password') \gexec
SELECT format('ALTER ROLE sentinel_bot PASSWORD %L', :'bot_password') \gexec

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

SELECT format('GRANT CONNECT ON DATABASE %I TO sentinel_api, sentinel_bot', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO sentinel_api, sentinel_bot;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "GuildSettings", "LogRoute", "LogEvent", "MessageSnapshot",
  "PanelAudit", "PanelSession", "PanelRoleBinding",
  "InstallBlock", "SuperAdminAudit",
  "InstanceConfig", "StatusChannel", "WaitlistEntry", "InstallGrant", "Coupon"
TO sentinel_api;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "GuildSettings", "LogRoute", "LogEvent", "MessageSnapshot"
TO sentinel_bot;
GRANT SELECT ON TABLE "InstallBlock", "InstallGrant", "StatusChannel" TO sentinel_bot;
REVOKE ALL ON TABLE "PanelAudit", "PanelSession", "PanelRoleBinding", "SuperAdminAudit",
  "InstanceConfig", "WaitlistEntry", "Coupon" FROM sentinel_bot;
ALTER ROLE sentinel_api NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
ALTER ROLE sentinel_bot NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
SQL
unset PGPASSWORD API_DB_PASSWORD BOT_DB_PASSWORD
