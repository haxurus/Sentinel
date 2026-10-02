# Deploy GitHub -> VPS

Questa procedura è pensata per la VPS di produzione con Docker Compose e Nginx Proxy Manager già presenti. Sentinel non pubblica database, Redis, API o pannello direttamente sulle porte dell'host.

## Modello di deploy

GitHub Actions costruisce due immagini:

- `runtime`: API, bot e web;
- `migrate`: immagine one-shot per `prisma migrate deploy`.

Le immagini vengono pubblicate su `ghcr.io/haxurus/sentinel` e la VPS riceve i riferimenti **immutabili per digest** (`@sha256:...`).

Il deploy SSH usa l'utente dedicato `sentinel-deploy`. La sua chiave `authorized_keys` ha un forced-command e `restrict`, quindi non può aprire una shell, fare port forwarding o eseguire comandi generici.

## 1. Generare la chiave GitHub Actions

Da una macchina fidata:

```bash
ssh-keygen -t ed25519 -a 100 -f sentinel_deploy -C "sentinel-github-actions"
```

Si ottengono:

- `sentinel_deploy` - **privata**, da mettere solo nei GitHub Secrets;
- `sentinel_deploy.pub` - pubblica, da copiare temporaneamente sulla VPS per l'installazione.

Non riutilizzare la chiave SSH amministrativa personale.

## 2. Installare l'infrastruttura Sentinel sulla VPS

Clonare temporaneamente la repository e avviare l'installer come root:

```bash
git clone https://github.com/haxurus/Sentinel.git /tmp/Sentinel
cd /tmp/Sentinel
sudo ./ops/install-vps.sh /percorso/sentinel_deploy.pub
```

L'installer:

- crea `/srv/docker/sentinel` root-only;
- crea l'utente `sentinel-deploy`;
- installa il forced-command SSH;
- installa `/usr/local/sbin/sentinel-deploy` root-owned;
- crea i secret interni casuali;
- crea i file vuoti per token Discord/OAuth;
- installa la configurazione Compose di produzione;
- installa il firewall egress persistente;
- verifica l'esistenza della rete Docker `proxy_net`.

Per aggiornare in futuro **solo l'infrastruttura statica** dopo averla revisionata:

```bash
cd /tmp/Sentinel
git pull --ff-only
sudo ./ops/install-vps.sh
```

Senza argomento la chiave deploy esistente viene mantenuta.

## 3. Configurare la VPS

Modificare le impostazioni non segrete:

```bash
sudoedit /srv/docker/sentinel/.env
```

Esempio:

```dotenv
DISCORD_CLIENT_ID=123456789012345678
PUBLIC_BASE_URL=https://sentinel.example.com/backend
WEB_URL=https://sentinel.example.com
POSTGRES_ADMIN_USER=sentinel_owner
POSTGRES_DB=sentinel_audit
LOG_LEVEL=info
```

Inserire i due secret Discord senza passarli nella command line:

```bash
sudoedit /srv/docker/sentinel/secrets/discord_token
sudoedit /srv/docker/sentinel/secrets/discord_client_secret
```

Gli altri secret sono generati automaticamente dall'installer.

Verificare i permessi:

```bash
sudo find /srv/docker/sentinel/secrets -maxdepth 1 -type f -printf '%m %u:%g %p\n'
```

Devono essere root-only (`600`).

## 4. Configurare Nginx Proxy Manager

Il container `edge` si collega alla rete Docker esterna `proxy_net` con alias:

```text
sentinel-edge
```

In Nginx Proxy Manager creare un Proxy Host:

- Scheme: `http`
- Forward Hostname/IP: `sentinel-edge`
- Forward Port: `8080`
- Websockets: opzionale
- SSL: secondo la policy già adottata sulla VPS

NPM vede soltanto il piccolo edge proxy. Il container `web` non è collegato direttamente a `proxy_net` e non riceve secret.

## 5. Configurare Discord OAuth2

Nel Discord Developer Portal aggiungere:

```text
https://sentinel.example.com/backend/auth/discord/callback
```

Il valore deve corrispondere esattamente a `PUBLIC_BASE_URL`.

## 6. Configurare GitHub

Creare prima l'environment GitHub **`production`**, limitarlo al branch `main` e, se disponibile, richiedere almeno un reviewer. Inserire poi **nell'environment `production`** questi secret (non come repository secrets generali):

- `VPS_HOST` - hostname o IPv4 della VPS;
- `VPS_PORT` - normalmente `22`;
- `VPS_DEPLOY_KEY` - contenuto completo della chiave privata `sentinel_deploy`;
- `VPS_KNOWN_HOSTS` - host key SSH verificata della VPS.

Per `VPS_KNOWN_HOSTS`, ottenere la chiave direttamente dalla VPS e costruire una riga known_hosts verificata. Con porta 22:

```text
vps.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
```

Se si usa un IP nel secret `VPS_HOST`, la prima colonna deve essere quello stesso IP. Per porte non standard usare la sintassi `[host]:porta`.

Non usare `StrictHostKeyChecking=no` e non affidarsi a uno `ssh-keyscan` non verificato dentro la CI.

Creare inoltre la repository variable:

```text
ENABLE_VPS_DEPLOY=true
```

Finché questa variabile non è `true`, il workflow costruisce/pusha le immagini ma non contatta la VPS.

### Environment `production`

L'environment `production` è un confine di sicurezza: deve consentire deploy soltanto da `main`. Se disponibile sul piano GitHub usato, richiedere anche approvazione/reviewer. Questo impedisce a un branch arbitrario di ottenere automaticamente i secret SSH di produzione.

## 7. GHCR

Le immagini vengono pubblicate come package Container in GitHub Container Registry.

Dato che la repository è pubblica, la configurazione più semplice è rendere pubblico anche il package `haxurus/sentinel`. In questo caso la VPS può eseguire `docker pull` senza credenziali GitHub.

Se si vuole mantenere il package privato, effettuare una volta il login GHCR sulla VPS con un token **read-only per packages** e conservarne le credenziali Docker soltanto sul root account.

## 8. Primo deploy

Dopo aver completato i passaggi precedenti, un push/merge su `main` avvia:

1. build runtime;
2. build migration image;
3. SBOM e provenance BuildKit;
4. push GHCR;
5. deploy dei digest immutabili;
6. backup DB pre-deploy se esiste già un database;
7. migration;
8. health check di API, bot, web ed edge.

Se i servizi non diventano healthy entro la finestra prevista, lo script prova a ripristinare l'immagine applicativa precedente.

## 9. Rollback

Da GitHub:

**Actions -> Rollback production -> Run workflow**

Oppure dalla VPS:

```bash
sudo /usr/local/sbin/sentinel-deploy rollback
```

Lo script alterna la release corrente e quella precedente registrate in file root-only.

### Nota sulle migrazioni

Il rollback automatico non può rendere magicamente reversibile una migrazione distruttiva. Le migration devono seguire un approccio expand/contract:

1. aggiungere schema compatibile;
2. distribuire codice nuovo;
3. migrare i dati se necessario;
4. rimuovere colonne/tabelle obsolete solo in una release successiva quando il rollback non le richiede più.

Prima di ogni deploy successivo al primo viene salvato un dump PostgreSQL in:

```text
/srv/docker/sentinel/backups/
```

con permessi root-only e retention locale di 14 giorni.

## 10. Branch protection consigliata

Proteggere `main` nelle impostazioni GitHub:

- richiedere Pull Request;
- richiedere il check `CI / validate`;
- bloccare force-push e cancellazione branch;
- richiedere risoluzione delle review conversation;
- mantenere CODEOWNERS/review per modifiche sensibili.

Le modifiche a `deploy/`, `ops/`, `security/`, `.github/workflows/` e alle migration meritano sempre review manuale.
