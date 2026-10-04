# Security Policy

## Reporting vulnerabilities

Do not publish tokens, credentials, database dumps, sensitive logs, or working exploit details in public issues.

For project vulnerabilities, use the repository's **GitHub Private Vulnerability Reporting / Security Advisories** when available.

In case of a suspected compromise:

1. temporarily disable automatic deployment by setting `ENABLE_VPS_DEPLOY=false`;
2. rotate affected Discord tokens, OAuth secrets, and deployment keys;
3. revoke compromised sessions/persisted credentials;
4. inspect host/container logs;
5. restore from a known-good release and backup.

## Secrets

Never commit:

- real `.env` files;
- `secrets/*`;
- Discord tokens;
- OAuth client secrets;
- PostgreSQL/Redis passwords;
- `log_data_encryption_key`;
- private SSH keys;
- database dumps or log exports.

The repository contains only example files without real credentials.
