const features = [
  {
    kicker: 'Moderazione',
    title: 'Audit delle azioni importanti',
    text: 'Join, leave, kick, ban, ruoli, canali, permessi, webhook, AutoMod, Stage e Audit Log Discord in un unico storico.'
  },
  {
    kicker: 'Messaggi',
    title: 'Contesto quando serve',
    text: 'Registra creazioni, modifiche, eliminazioni, allegati e snapshot, con controlli separati per acquisizione e pubblicazione.'
  },
  {
    kicker: 'Routing',
    title: 'Ogni evento nel posto giusto',
    text: 'Decidi quali eventi conservare, quali inviare su Discord e in quale canale recapitarli, senza trasformare il server in rumore.'
  },
  {
    kicker: 'Ricerca',
    title: 'Uno storico consultabile',
    text: 'Filtra gli eventi per server, attore, target, canale e intervallo temporale; esporta i dati quando hai bisogno di analizzarli.'
  },
  {
    kicker: 'Accessi',
    title: 'Dashboard con ruoli',
    text: 'Il pannello usa Discord OAuth2 e controlli RBAC per separare visualizzazione, moderazione e amministrazione.'
  },
  {
    kicker: 'Sicurezza',
    title: 'Pensato per stare isolato',
    text: 'Secret separati, database con ruoli distinti, Redis privato, reti Docker segmentate e cifratura AES-256-GCM dei dati sensibili.'
  }
];

export default function Home() {
  return (
    <main className="public-site">
      <header className="site-header">
        <div className="site-container site-nav">
          <a className="site-brand" href="/" aria-label="Sentinel - Home">
            <span className="site-brand-mark" aria-hidden="true">S</span>
            <span>Sentinel</span>
          </a>

          <nav className="site-nav-links" aria-label="Navigazione principale">
            <a href="#funzioni">Funzioni</a>
            <a href="#come-funziona">Come funziona</a>
            <a href="#sicurezza">Sicurezza</a>
            <a href="/dashboard">Dashboard</a>
          </nav>

          <div className="site-nav-actions">
            <a className="site-button site-button-ghost site-nav-dashboard" href="/dashboard">Accedi</a>
            <a className="site-button site-button-primary site-nav-invite" href="/backend/bot/invite">Aggiungi Sentinel</a>
          </div>

          <details className="site-mobile-menu">
            <summary aria-label="Apri menu"><span /><span /><span /></summary>
            <div>
              <a href="#funzioni">Funzioni</a>
              <a href="#come-funziona">Come funziona</a>
              <a href="#sicurezza">Sicurezza</a>
              <a href="/dashboard">Dashboard</a>
              <a className="site-button site-button-primary" href="/backend/bot/invite">Aggiungi Sentinel</a>
            </div>
          </details>
        </div>
      </header>

      <section className="site-hero">
        <div className="site-container site-hero-grid">
          <div className="site-hero-copy">
            <span className="site-kicker">DISCORD AUDIT &amp; LOGGING</span>
            <h1>Quello che succede nel server, finalmente resta chiaro.</h1>
            <p>
              Sentinel raccoglie gli eventi Discord, li organizza in uno storico ricercabile
              e ti lascia decidere cosa conservare e cosa pubblicare nei canali di log.
            </p>
            <div className="site-hero-actions">
              <a className="site-button site-button-primary" href="/backend/bot/invite">Aggiungi Sentinel a Discord</a>
              <a className="site-button site-button-secondary" href="/dashboard">Apri la dashboard</a>
            </div>
            <div className="site-hero-note"><span />Self-hosted · accessi controllati · nessun permesso Administrator richiesto</div>
          </div>

          <div className="site-console" aria-label="Anteprima di Sentinel">
            <div className="site-console-top">
              <span>sentinel / audit stream</span>
              <span className="site-live"><i /> LIVE</span>
            </div>
            <div className="site-console-event">
              <span className="site-event-time">20:41:18</span>
              <div><strong>member.ban</strong><p>Utente rimosso dal server</p></div>
              <span className="site-event-state">registrato</span>
            </div>
            <div className="site-console-event">
              <span className="site-event-time">20:38:04</span>
              <div><strong>role.update</strong><p>Permessi del ruolo modificati</p></div>
              <span className="site-event-state">registrato</span>
            </div>
            <div className="site-console-event">
              <span className="site-event-time">20:33:51</span>
              <div><strong>message.delete</strong><p>Messaggio eliminato nel canale</p></div>
              <span className="site-event-state">registrato</span>
            </div>
            <div className="site-console-footer">
              <span>Routing attivo</span>
              <span>Storico protetto</span>
            </div>
          </div>
        </div>

        <div className="site-container site-stats">
          <div><strong>75</strong><span>tipi di evento configurabili</span></div>
          <div><strong>30 gg</strong><span>retention predefinita</span></div>
          <div><strong>AES-256-GCM</strong><span>protezione dati sensibili</span></div>
        </div>
      </section>

      <section className="site-section" id="funzioni">
        <div className="site-container">
          <div className="site-section-head">
            <div>
              <span className="site-kicker">FUNZIONI</span>
              <h2>Più di un semplice canale di log.</h2>
            </div>
            <p>
              Sentinel separa acquisizione, conservazione e invio su Discord: puoi tenere uno storico
              completo senza dover pubblicare ogni singolo evento.
            </p>
          </div>
          <div className="site-feature-grid">
            {features.map((feature) => (
              <article className="site-feature-card" key={feature.title}>
                <span>{feature.kicker}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section site-section-alt" id="come-funziona">
        <div className="site-container">
          <div className="site-section-head">
            <div>
              <span className="site-kicker">COME FUNZIONA</span>
              <h2>Dal server alla dashboard in tre passaggi.</h2>
            </div>
          </div>
          <div className="site-steps">
            <article><span>01</span><h3>Aggiungi il bot</h3><p>Autorizza Sentinel sul server con i permessi strettamente necessari alle funzioni che vuoi usare.</p></article>
            <article><span>02</span><h3>Accedi con Discord</h3><p>La dashboard riconosce i server disponibili e applica i livelli di accesso configurati.</p></article>
            <article><span>03</span><h3>Configura i logger</h3><p>Scegli eventi, destinazioni, retention e dettagli da conservare. Le modifiche restano tracciate nel pannello.</p></article>
          </div>
        </div>
      </section>

      <section className="site-section" id="sicurezza">
        <div className="site-container site-security">
          <div>
            <span className="site-kicker">SICUREZZA</span>
            <h2>Isolamento prima delle scorciatoie.</h2>
            <p>
              Il token Discord resta nel processo bot, l'API usa credenziali separate e i servizi
              comunicano attraverso reti Docker segmentate. I container applicativi girano senza privilegi
              superflui e con filesystem read-only dove previsto.
            </p>
          </div>
          <div className="site-security-list">
            <div><strong>Least privilege</strong><span>Niente permesso Administrator richiesto al bot.</span></div>
            <div><strong>Secret separati</strong><span>Token, sessioni, database e chiavi non finiscono nel frontend.</span></div>
            <div><strong>Audit del pannello</strong><span>Le modifiche amministrative vengono registrate.</span></div>
            <div><strong>Retention configurabile</strong><span>Conserva i dati per il tempo realmente necessario.</span></div>
          </div>
        </div>
      </section>

      <section className="site-cta-section">
        <div className="site-container site-cta-card">
          <div>
            <span className="site-kicker">SENTINEL</span>
            <h2>Porta ordine nei log del tuo server.</h2>
            <p>Aggiungi il bot, accedi con Discord e configura il primo logger dalla dashboard.</p>
          </div>
          <div className="site-cta-actions">
            <a className="site-button site-button-secondary" href="/dashboard">Dashboard</a>
            <a className="site-button site-button-primary" href="/backend/bot/invite">Aggiungi Sentinel</a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-container">
          <div className="site-footer-shell">
            <div className="site-footer-brand">
              <strong>Sentinel</strong>
              <p>Logging e auditing self-hosted per server Discord, con storico ricercabile e configurazione web.</p>
            </div>
            <div className="site-footer-links">
              <a href="#funzioni">Funzioni</a>
              <a href="#sicurezza">Sicurezza</a>
              <a href="/dashboard">Dashboard</a>
              <a href="/backend/bot/invite">Aggiungi il bot</a>
              <a href="https://github.com/haxurus/Sentinel" target="_blank" rel="noreferrer">GitHub</a>
            </div>
          </div>
          <div className="site-footer-bottom">
            <span>Sentinel © 2026 · Made by Haxurus</span>
            <span>Discord Audit &amp; Logging</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
