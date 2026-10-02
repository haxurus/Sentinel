# Validation - v0.3.0

Controlli eseguiti prima del commit iniziale della repository:

- parsing di tutti i `package.json`: OK;
- parsing YAML di Compose, workflow GitHub Actions e Dependabot: OK;
- `sh -n` su script `ops/`, `security/`, `docker/` e `scripts/`: OK;
- transpile sintattico di tutti i file TypeScript/TSX: 22 file, 0 errori di sintassi;
- compilazione TypeScript del package `@sentinel/shared`: OK;
- verifica identità tra lo script DB hardening sorgente e la copia runtime production: OK;
- verifica assenza dei vecchi namespace/nome Celestia: OK;
- verifica che non siano presenti file secret reali nella tree: OK;
- verifica che il token Discord non venga passato ad API/web: OK per architettura Compose;
- verifica separazione reti/credenziali PostgreSQL tra API e bot: OK per configurazione;
- health endpoint API con verifica database aggiunto;
- health endpoint bot collegato allo stato `client.isReady()` aggiunto.

## Limiti dell'ambiente di generazione

La rete dell'ambiente non ha completato `npm install`, quindi non è stato possibile eseguire localmente la build completa con tutte le dipendenze npm reali.

Docker CLI non è disponibile nell'ambiente di generazione, quindi `docker compose config` e la build delle immagini vengono verificati dalla CI GitHub al primo Pull Request/build.

La pipeline `.github/workflows/ci.yml` esegue:

1. validazione shell;
2. validazione `docker compose config` del file production;
3. build target Docker `runtime`;
4. build target Docker `migrate`.

Il deploy verso la VPS rimane disabilitato finché la variabile GitHub `ENABLE_VPS_DEPLOY` non viene impostata a `true`.
