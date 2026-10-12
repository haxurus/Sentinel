# Security Policy

## Reporting vulnerabilities

Do not publish tokens, credentials, database dumps, sensitive logs, or working exploit details in public issues.

Report vulnerabilities privately through GitHub: **[Report a vulnerability](https://github.com/haxurus/Sentinel/security/advisories/new)** (Security → Advisories). If you cannot use GitHub, write to haxurus@icloud.com. Please allow time for a fix before any public disclosure.

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
