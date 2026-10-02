# Runtime secrets

Create these files locally before starting the stack. Never commit them.

- `discord_token`
- `discord_client_secret`
- `session_secret`
- `log_data_encryption_key`
- `bot_internal_api_key`
- `postgres_admin_password`
- `api_db_password`
- `bot_db_password`
- `redis_password`

Recommended generation:

```bash
mkdir -p secrets
umask 077
openssl rand -base64 48 | tr -d '\n' > secrets/session_secret
openssl rand -base64 48 | tr -d '\n' > secrets/bot_internal_api_key
openssl rand -base64 32 | tr -d '\n' > secrets/log_data_encryption_key
for f in postgres_admin_password api_db_password bot_db_password redis_password; do
  openssl rand -hex 32 > "secrets/$f"
done
```

Put the Discord bot token in `discord_token` and the OAuth client secret in `discord_client_secret`.
