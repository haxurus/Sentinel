# Sentinel

Sentinel è un sistema self-hosted di logging e auditing per Discord con pannello web amministrativo. Registra gli eventi disponibili tramite Discord Gateway/REST/Audit Log, conserva uno storico interrogabile e può pubblicare i log in canali Discord configurabili.

> Repository di produzione. Nessun token Discord, password database, chiave di cifratura o secret applicativo deve essere salvato su GitHub.

## Componenti

- `apps/bot` - Discord Gateway, snapshot messaggi, recorder, dispatcher e RPC interna.
- `apps/api` - Discord OAuth2, RBAC, configurazione, ricerca, export e retention.
- `apps/web` - pannello Next.js.
- `packages/db` - Prisma/PostgreSQL e migrazioni.
- `packages/shared` - catalogo eventi condiviso.
- `deploy` - Compose di produzione e configurazione edge.
- `ops` - installazione VPS, deploy ristretto e rollback.
- `security` - regole firewall e hardening aggiuntivo.

## Funzioni principali

Sentinel include **75 tipi di evento configurabili**, tra cui:

- join, leave, kick, ban, unban e modifiche membro;
- messaggi creati/modificati/eliminati e bulk delete;
- snapshot messaggi, allegati e metadata;
- reaction e poll;
- voice state ed effetti esposti da Discord;
- ruoli, canali, permission overwrite, pin;
- thread/forum, emoji, sticker, soundboard;
- invite, webhook, integrazioni;
- server updates, scheduled events, AutoMod e Stage;
- interazioni, application command permissions;
- Audit Log Discord;
- presence, typing e Gateway raw opzionali;
- eventi di sistema del bot.

Ogni logger separa **acquisizione** e **invio Discord**, quindi un evento può essere conservato nello storico senza produrre messaggi nei canali di log.

## Sicurezza

La versione corrente applica un modello zero-trust/least-privilege:

- token Discord disponibile solo al processo bot;
- API priva del token bot;
- frontend senza segreti applicativi;
- segreti runtime in file root-only sulla VPS;
- cifratura AES-256-GCM dei dati sensibili applicativi;
- utenti PostgreSQL separati per API e bot;
- Redis privato e autenticato;
- reti Docker segmentate;
- filesystem container read-only, non-root dove applicabile, `cap_drop: ALL`, limiti CPU/RAM/PID;
- cookie sicuri, CSRF Origin check, CSP, HSTS, rate limiting e validazione input;
- nessun Docker socket montato;
- egress di API/bot separato e bloccato verso host/LAN tramite firewall;
- deployment GitHub con account SSH dedicato che **non dispone di una shell amministrativa** e può eseguire solo `deploy`, `rollback` e `status` tramite wrapper root-owned.

Dettagli: [`docs/SECURITY.md`](docs/SECURITY.md).

## Policy capacità Discord

Il processo bot applica una allowlist runtime alle richieste REST Discord. I permessi Discord assegnati al ruolo del bot **non sono considerati autorizzazione sufficiente** per eseguire una mutazione.

Consentito:

- lettura REST (`GET`), inclusi canali, messaggi, membri, ruoli e Audit Log;
- ricezione degli eventi Gateway;
- invio dei log tramite `POST /channels/:channelId/messages`, inclusi embed;
- uscita dal server tramite `DELETE /users/@me/guilds/:guildId`, usata dalla super-console e dall'enforcement della blacklist.

Qualsiasi altra mutazione Discord `POST`, `PUT`, `PATCH` o `DELETE` viene bloccata dal processo prima di raggiungere Discord. Questo include, tra le altre cose:

- ban, kick, timeout e modifiche dei membri;
- cancellazione o bulk-delete dei messaggi;
- creazione/modifica/eliminazione di canali e ruoli;
- permission overwrite;
- modifica delle impostazioni del server;
- creazione/modifica/eliminazione webhook;
- operazioni amministrative AutoMod.

Il build del bot esegue inoltre `policy:check`, che verifica casi consentiti/vietati e rifiuta bypass evidenti come accesso REST Discord diretto, HTTP diretto all'API Discord o mutazioni ad alto livello note.


## CI/CD GitHub -> VPS

Il deploy di produzione non esegue `git pull` come root e non compila codice sulla VPS.

```text
Pull Request
    |
    v
GitHub CI -> Docker build

merge/push main
    |
    v
GitHub Actions
    |
    +--> build runtime image
    +--> build migration image
    +--> SBOM + provenance
    +--> push GHCR
    |
    v
SSH con chiave dedicata e forced-command
    |
    v
/srv/docker/sentinel
    |
    +--> backup DB pre-deploy
    +--> pull immagini per digest SHA-256
    +--> migration
    +--> avvio stack
    +--> health check
    +--> rollback app se necessario
```

I secret applicativi **non transitano da GitHub Actions**. Su GitHub servono solo le credenziali di deploy SSH della VPS, conservate nell'environment protetto `production`.

Guida completa: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Sviluppo locale

Requisiti:

- Node.js 22+
- Docker + Docker Compose
- applicazione Discord di test

Il progetto usa npm workspaces.

```bash
npm install
npm run db:generate
npm run build
```

Per il Compose locale/hardened:

```bash
cp .env.example .env
mkdir -p secrets
# Popolare i secret come descritto in secrets/README.md
docker compose up -d --build
```

## Discord Developer Portal

Privileged Gateway Intents usati dal progetto:

- Server Members Intent
- Presence Intent, se usi il logger presenze
- Message Content Intent, se vuoi conservare il contenuto dei messaggi

OAuth2 redirect di produzione:

```text
https://<hostname-sentinel>/backend/auth/discord/callback
```

Permessi consigliati al bot, senza `Administrator`:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- View Audit Log

Aggiungere solo gli ulteriori permessi strettamente necessari alle funzioni effettivamente abilitate.

## Installazioni private durante lo sviluppo

L'istanza hosted può limitare l'installazione del bot a una allowlist di Discord User ID tramite:

```env
INVITE_ALLOWED_USER_IDS=123456789012345678
```

Il pulsante di installazione richiede prima l'identificazione Discord. Gli utenti non presenti nell'allowlist vengono reindirizzati a una pagina che indica che il progetto è ancora in sviluppo e rimanda al repository/fork.

Questa protezione del sito **non sostituisce** l'impostazione Discord del bot: durante lo sviluppo impostare anche **Public Bot = OFF** nel Developer Portal e **Installation > Install Link = None**, così un utente non autorizzato non può aggirare il sito costruendo manualmente un URL OAuth.

## Super console

L'istanza hosted include una super-console globale riservata al proprietario dell'installazione. Il controllo è effettuato server-side sulla sessione Discord.

Configurazione esplicita consigliata:

```env
SUPER_ADMIN_USER_ID=123456789012345678
```

Per compatibilità con installazioni private già esistenti, se `SUPER_ADMIN_USER_ID` è vuoto e `INVITE_ALLOWED_USER_IDS` contiene **esattamente un** ID, quell'unico account viene usato come super-admin. Se l'allowlist contiene più account senza un super-admin esplicito, la super-console resta disabilitata.

La super-console permette di:

- vedere la lista live dei server in cui il bot è connesso;
- far uscire il bot da un server;
- blacklistare server, con espulsione immediata e rifiuto automatico ai successivi ingressi;
- blacklistare Discord User ID dall'installazione hosted;
- rimuovere elementi dalla blacklist;
- consultare un audit separato delle azioni super-admin.

Le API della super-console richiedono sempre la sessione del super-admin; nascondere il link nel frontend non è usato come controllo di sicurezza.


## Database e retention

- PostgreSQL conserva configurazione, eventi, snapshot e audit pannello.
- Redis/BullMQ gestisce la coda di consegna verso Discord.
- Le migrazioni di produzione usano `prisma migrate deploy`.
- Retention predefinita: 30 giorni, configurabile.
- Le sessioni pannello scadono dopo 8 ore.

Le migrazioni devono essere **backward-compatible** con almeno una release precedente per rendere sicuro il rollback applicativo. Le rimozioni distruttive vanno fatte in una release successiva.

## Limiti Discord

Sentinel può registrare solo ciò che Discord rende disponibile al bot tramite Gateway, REST e Audit Log con intent e permessi concessi. Non può leggere DM private tra utenti, sapere cosa una persona sta guardando nel client o registrare automaticamente l'audio delle conversazioni vocali tramite i normali eventi Gateway.

## Operazioni

Stato produzione dalla VPS:

```bash
sudo /usr/local/sbin/sentinel-deploy status
```

Rollback manuale:

```bash
sudo /usr/local/sbin/sentinel-deploy rollback
```

In alternativa è disponibile il workflow GitHub Actions **Rollback production**.

## Documentazione

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/VALIDATION.md`](docs/VALIDATION.md)
