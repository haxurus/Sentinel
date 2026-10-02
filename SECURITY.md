# Security Policy

## Segnalazione vulnerabilità

Non pubblicare token, credenziali, dump database, log sensibili o dettagli di exploit funzionanti in issue pubbliche.

Per vulnerabilità del progetto usare, quando disponibile, **GitHub Private Vulnerability Reporting / Security Advisories** della repository.

In caso di possibile compromissione:

1. disabilitare temporaneamente il deploy automatico impostando `ENABLE_VPS_DEPLOY=false`;
2. ruotare token Discord, OAuth secret e chiavi di deploy interessate;
3. revocare le sessioni/persistenze compromesse;
4. analizzare i log host/container;
5. ripristinare da una release e backup noti come affidabili.

## Secret

Non committare mai:

- `.env` reali;
- `secrets/*`;
- token Discord;
- OAuth client secret;
- password PostgreSQL/Redis;
- `log_data_encryption_key`;
- chiavi SSH private;
- dump database o export log.

La repository contiene soltanto file di esempio senza credenziali reali.
