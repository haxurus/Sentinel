# Security model

## Obiettivo

Ridurre al minimo la superficie di attacco, il movimento laterale, l'esposizione dei segreti e l'impatto di una compromissione di un singolo componente.

## Confini di fiducia

- `web`: nessun segreto applicativo, accesso soltanto all'API interna.
- `api`: OAuth, sessioni, configurazione e lettura log. Non possiede il token Discord del bot.
- `bot`: possiede il token Discord e accede soltanto alle tabelle necessarie al logging.
- `postgres`: nessuna porta pubblicata; reti DB separate tra API, bot e migrazione.
- `redis`: visibile solo al bot, autenticato, senza porta pubblicata.
- `bot_rpc`: rete interna condivisa soltanto da API e bot; endpoint GET limitati a risorse server e verifica accesso.

## Segreti

I segreti sono file sotto `./secrets/` e vengono montati in `/run/secrets`. Non vengono passati al frontend e non vengono inseriti direttamente nel file Compose.

Non salvare mai `./secrets` nello stesso backup del database. Conservare `log_data_encryption_key` separatamente dal dump PostgreSQL.

Una compromissione completa dell'host o accesso root/Docker daemon può comunque leggere i secret montati. Non montare mai `/var/run/docker.sock` nei container del progetto.

## Cifratura dati

I dati sensibili applicativi vengono cifrati con AES-256-GCM usando nonce casuale per record. La chiave è `log_data_encryption_key`.

Sono cifrati:

- `LogEvent.details`;
- contenuto messaggi salvato negli snapshot;
- allegati/embed degli snapshot;
- dettagli dell'audit pannello;
- lista guild memorizzata nelle sessioni.

Gli ID necessari a query e relazioni, le date e i riepiloghi operativi restano in chiaro.

Non perdere la chiave: senza di essa i dati cifrati non sono recuperabili.

## Database least privilege

`sentinel_api` può accedere alle tabelle applicative necessarie al pannello.

`sentinel_bot` può accedere soltanto a:

- `GuildSettings`;
- `LogRoute`;
- `LogEvent`;
- `MessageSnapshot`.

Il bot non ha accesso a sessioni del pannello, binding RBAC o audit amministrativo.

Le credenziali owner PostgreSQL sono usate soltanto dai job one-shot `migrate` e `secure-db` su una rete isolata senza egress Internet.

## Protezioni web/API

- cookie di produzione `__Host-*`;
- `Secure`, `HttpOnly`, `SameSite=Lax`;
- OAuth state confrontato in constant-time;
- controllo `Origin` su POST/PUT/PATCH/DELETE;
- rate limit globale;
- body massimo 32 KiB lato API e 64 KiB lato edge proxy;
- timeout outbound verso Discord;
- validazione Snowflake e whitelist degli `eventKey`;
- thumbnail soltanto HTTPS;
- risposte autenticate con `Cache-Control: no-store`;
- CSP, HSTS, anti-framing, `nosniff`, Referrer/Permissions Policy.

## Isolamento container

Per API, bot e web:

- utente non-root;
- `no-new-privileges`;
- `cap_drop: ALL`;
- root filesystem read-only;
- `/tmp` in tmpfs con `noexec` dove possibile;
- limiti CPU, RAM e PID;
- nessuna porta API/DB/Redis pubblicata sull'host.

## Egress ed esfiltrazione

Zero esfiltrazione assoluta non è garantibile per il processo bot: per funzionare deve ricevere dati da Discord e avere connettività outbound verso Discord. Se quel processo fosse compromesso, il codice ostile avrebbe contemporaneamente accesso a dati del gateway e a una connessione di rete necessaria al servizio.

La configurazione riduce l'impatto così:

- il bot non possiede secret OAuth o sessioni web;
- il bot non può leggere le tabelle amministrative;
- API e bot hanno reti e credenziali DB diverse;
- web non possiede alcun secret sensibile;
- nessun componente vede servizi host esterni alla propria rete Docker, salvo l'egress Internet esplicitamente necessario.

Per un ambiente ad altissima sicurezza, aggiungere sul firewall host un egress gateway/proxy con allowlist dei servizi Discord. Questa misura deve essere progettata con attenzione perché Discord usa endpoint e infrastruttura dinamici e un blocco IP statico può interrompere Gateway/WebSocket/API.

## Permessi Discord

Non assegnare `Administrator` al bot. Concedere solo i permessi necessari nei canali e `View Audit Log` se serve attribuire le azioni amministrative. Limitare esplicitamente i canali in cui può inviare messaggi.

## Backup

- cifrare i backup del volume PostgreSQL;
- non includere `./secrets` nello stesso archivio;
- proteggere i backup con permessi filesystem stretti;
- testare periodicamente il restore;
- ruotare Discord token, OAuth secret e chiavi RPC dopo un incidente.

## Host

La sicurezza del progetto non protegge da un host già compromesso. Sul VPS usare almeno:

- SSH key-only;
- utente amministrativo non-root con sudo;
- firewall inbound deny-by-default;
- aggiornamenti di sicurezza automatici o regolari;
- Docker socket non esposto;
- filesystem/volume cifrato se il threat model comprende furto del disco;
- accesso al pannello limitabile via VPN/reverse proxy se possibile.

## Blocco accesso host/LAN

Le reti egress di produzione usano i bridge fissi `sentinel-api-eg` e `sentinel-bot-eg`. Su host Linux con iptables eseguire:

```bash
sudo ./security/host-firewall.sh
```

Lo script blocca dai bridge egress l'accesso ai servizi della VPS e alle reti private/link-local. Non sostituisce un egress proxy per allowlist per dominio e non può impedire a codice compromesso di comunicare con un host Internet pubblico.


## Sicurezza della supply chain e del deploy

- GitHub Actions non riceve token Discord, password DB, session secret o chiave di cifratura.
- Le immagini vengono distribuite alla VPS usando il digest immutabile `sha256`, non il tag `latest`.
- I build pubblicano attestazioni BuildKit SBOM e provenance.
- L'utente SSH `sentinel-deploy` usa una chiave dedicata con `restrict` e forced-command.
- Il wrapper SSH accetta soltanto `deploy`, `rollback` e `status`; non offre una shell generica.
- Lo script privilegiato e il Compose di produzione sono root-owned e non vengono aggiornati automaticamente da GitHub.
- Le modifiche infrastrutturali richiedono un aggiornamento manuale con `sudo ./ops/install-vps.sh`, dopo review.
- Prima dei deploy successivi al primo viene creato un dump PostgreSQL locale root-only.

Questo separa il compromesso del repository/applicazione dal controllo amministrativo completo della VPS. Un attaccante con capacità di scrittura su `main` può comunque tentare di distribuire codice applicativo malevolo: per questo `main` va protetto con PR, CI, review e protezioni dell'environment `production`.
