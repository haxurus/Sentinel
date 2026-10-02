# Architettura

## Flusso evento

```text
Discord Gateway
    |
    v
apps/bot/src/handlers.ts
    |
    +--> MessageSnapshot, quando applicabile
    |
    v
LogEvent (PostgreSQL)
    |
    v
BullMQ / Redis
    |
    v
Dispatcher
    |
    +--> legge LogRoute
    +--> applica filtri
    +--> genera embed
    v
Canale Discord
```

Il salvataggio dell'evento avviene prima della consegna a Discord. `captureEnabled` controlla l'acquisizione nel database, mentre `enabled` controlla separatamente l'invio nel canale Discord. Un errore o rate limit nell'invio dell'embed non fa perdere lo storico: BullMQ effettua retry con backoff. `LogEvent.dispatchState` conserva l'esito della consegna per diagnosi dal pannello. Ogni `LogRoute` puo inoltre sovrascrivere retention, aspetto dell'embed e visibilita dei campi principali.

## Pannello

```text
Browser
  |
  v
Next.js
  |  /backend/*
  v
Fastify API
  +--> Discord OAuth2
  +--> Discord REST API
  +--> PostgreSQL
```

## Sicurezza

- Session token casuale a 256 bit.
- Nel database viene conservato solo SHA-256 del token di sessione.
- Cookie HttpOnly, SameSite=Lax e Secure in produzione.
- OAuth2 `state` anti-CSRF per il login.
- Rate limiting API.
- Security headers via Helmet.
- Le autorizzazioni vengono controllate dal backend su ogni richiesta, non solo dalla UI.
- Gli IP nell'audit del pannello vengono hashati con una chiave server-side.

## RBAC

La precedenza è:

```text
OWNER > ADMIN > MODERATOR > VIEWER
```

Il proprietario Discord viene riconosciuto automaticamente. Administrator e Manage Server concedono accesso Admin. Gli altri utenti possono entrare se possiedono almeno un ruolo Discord mappato nel pannello.

## Scalabilità

Per una singola community il deployment Docker Compose è sufficiente. Se il volume cresce:

1. separare Worker BullMQ dal processo Gateway;
2. usare più worker di dispatch;
3. partizionare `LogEvent` per data;
4. introdurre sharding Discord;
5. spostare export pesanti in job asincroni controllati;
6. usare object storage per eventuali copie autorizzate degli allegati.

Gli allegati attualmente non vengono scaricati: viene conservato il metadata/URL ricevuto da Discord.
