# Security Policy

## Reporting vulnerabilities

Do not publish tokens, credentials, database dumps, sensitive logs, or working exploit details in public issues.

Report vulnerabilities privately through GitHub: **[Report a vulnerability](https://github.com/haxurus/Sentinel/security/advisories/new)** (Security → Advisories). If you cannot use GitHub, write to haxurus@icloud.com. Please allow time for a fix before any public disclosure.

## Incident response

What the operator of the hosted instance does when data may have been accessed without authorisation, or a system that processes Discord data may be compromised. The [Discord Developer Terms of Service](https://support-dev.discord.com/hc/articles/8562894815383-Discord-Developer-Terms-of-Service) (section 5c) require Discord and affected users to be notified promptly; the GDPR adds the deadlines below.

1. **Contain — immediately.**
   - Disable automatic deployment (`ENABLE_VPS_DEPLOY=false`) and, if needed, stop the affected containers or roll back to a known-good release.
   - Rotate whatever may be exposed: the Discord bot token and OAuth client secret (Developer Portal), the internal API key, database and Redis passwords, deployment SSH keys. Rotating `log_data_encryption_key` requires re-encrypting stored data: do it only if the key itself may have leaked.
   - Revoke dashboard sessions (delete the `PanelSession` rows) so everyone signs in again.
2. **Assess — within 24 hours.** Use host, container, Nginx and database logs to establish what was accessed, which servers and users are affected, since when, and whether the encrypted fields or the key were exposed. Keep a written timeline and the evidence.
3. **Notify Discord — promptly, as soon as the incident is confirmed.** Through the [Developer Support form](https://support-dev.discord.com/hc/requests/new), with what happened, the affected data and servers, the actions taken and the remediation in progress. Send updates until it is closed.
4. **Notify users — without undue delay.**
   - Administrators of the affected servers: an announcement on the [support server](https://discord.gg/DDBGWP5fMX) and on the website and, where possible, a message in each affected server's default log channel.
   - If the breach is likely to result in a high risk for the people involved, inform them directly as well (GDPR art. 34).
   - Personal data breach: notify the Garante per la protezione dei dati personali **within 72 hours** of becoming aware of it, unless it is unlikely to result in a risk (GDPR art. 33). Record every breach internally, even when it is not notified.
5. **Recover.** Restore from a known-good release and backup, re-enable deployment and watch the logs closely for the following days.
6. **Learn.** Write a short post-mortem (cause, impact, fixes) and track the fixes as issues; publish a GitHub security advisory when the cause is a vulnerability in Sentinel itself, so self-hosted instances can update.

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
