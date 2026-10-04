import { LanguageSwitcher } from './LanguageSwitcher';
import type { Locale } from '../i18n';

const copy = {
  it: {
    nav: { features: 'Funzioni', how: 'Come funziona', security: 'Sicurezza', signIn: 'Accedi', add: 'Aggiungi Sentinel' },
    hero: {
      line1: 'Il bot di audit e logging che tiene traccia di ciò che succede nel tuo server Discord.',
      line2: 'Configura cosa registrare, dove inviarlo e consulta tutto dalla dashboard.',
      dashboard: 'Apri la dashboard',
      add: 'Aggiungi Sentinel a Discord',
      preview: 'Anteprima di Sentinel',
      removed: 'Utente rimosso dal server',
      role: 'Permessi del ruolo modificati',
      deleted: 'Messaggio eliminato nel canale',
      recorded: 'registrato',
      routing: 'Routing attivo',
      history: 'Storico protetto'
    },
    features: {
      kicker: 'FUNZIONI',
      title: 'Più di un semplice canale di log.',
      intro: 'Sentinel separa acquisizione, conservazione e invio su Discord: puoi tenere uno storico completo senza dover pubblicare ogni singolo evento.',
      cards: [
        ['Moderazione', 'Audit delle azioni importanti', 'Join, leave, kick, ban, ruoli, canali, permessi, webhook, AutoMod, Stage e Audit Log Discord in un unico storico.'],
        ['Messaggi', 'Contesto quando serve', 'Registra creazioni, modifiche, eliminazioni, allegati e snapshot, con controlli separati per acquisizione e pubblicazione.'],
        ['Routing', 'Ogni evento nel posto giusto', 'Decidi quali eventi conservare, quali inviare su Discord e in quale canale recapitarli, senza trasformare il server in rumore.'],
        ['Ricerca', 'Uno storico consultabile', 'Filtra gli eventi per server, attore, target, canale e intervallo temporale; esporta i dati quando hai bisogno di analizzarli.'],
        ['Accessi', 'Dashboard con ruoli', 'Il pannello usa Discord OAuth2 e controlli RBAC per separare visualizzazione, moderazione e amministrazione.'],
        ['Sicurezza', 'Pensato per stare isolato', 'Secret separati, database con ruoli distinti, Redis privato, reti Docker segmentate e cifratura AES-256-GCM dei dati sensibili.']
      ]
    },
    how: {
      kicker: 'COME FUNZIONA',
      title: 'Dal server alla dashboard in tre passaggi.',
      steps: [
        ['Aggiungi il bot', 'Autorizza Sentinel sul server con i permessi strettamente necessari alle funzioni che vuoi usare.'],
        ['Accedi con Discord', 'La dashboard riconosce i server disponibili e applica i livelli di accesso configurati.'],
        ['Configura i logger', 'Scegli eventi, destinazioni, retention e dettagli da conservare. Le modifiche restano tracciate nel pannello.']
      ]
    },
    security: {
      kicker: 'SICUREZZA',
      title: 'Isolamento prima delle scorciatoie.',
      intro: "Il token Discord resta nel processo bot, l'API usa credenziali separate e i servizi comunicano attraverso reti Docker segmentate. I container applicativi girano senza privilegi superflui e con filesystem read-only dove previsto.",
      rows: [
        ['Least privilege', 'Niente permesso Administrator richiesto al bot.'],
        ['Secret separati', 'Token, sessioni, database e chiavi non finiscono nel frontend.'],
        ['Audit del pannello', 'Le modifiche amministrative vengono registrate.'],
        ['Retention configurabile', 'Conserva i dati per il tempo realmente necessario.']
      ]
    },
    cta: { title: 'Porta ordine nei log del tuo server.', text: 'Aggiungi il bot, accedi con Discord e configura il primo logger dalla dashboard.', add: 'Aggiungi Sentinel' },
    footer: { text: 'Logging e auditing self-hosted per server Discord, con storico ricercabile e configurazione web.', add: 'Aggiungi il bot' }
  },
  en: {
    nav: { features: 'Features', how: 'How it works', security: 'Security', signIn: 'Sign in', add: 'Add Sentinel' },
    hero: {
      line1: 'The audit and logging bot that keeps track of what happens on your Discord server.',
      line2: 'Choose what to record, where to send it, and review everything from the dashboard.',
      dashboard: 'Open dashboard',
      add: 'Add Sentinel to Discord',
      preview: 'Sentinel preview',
      removed: 'User removed from the server',
      role: 'Role permissions updated',
      deleted: 'Message deleted in the channel',
      recorded: 'recorded',
      routing: 'Routing active',
      history: 'History protected'
    },
    features: {
      kicker: 'FEATURES',
      title: 'More than a log channel.',
      intro: 'Sentinel separates collection, storage and Discord delivery, so you can keep a complete history without publishing every single event.',
      cards: [
        ['Moderation', 'Audit important actions', 'Joins, leaves, kicks, bans, roles, channels, permissions, webhooks, AutoMod, Stage and Discord Audit Log in one history.'],
        ['Messages', 'Context when you need it', 'Record creations, edits, deletions, attachments and snapshots, with separate controls for collection and publishing.'],
        ['Routing', 'Every event in the right place', 'Choose which events to keep, which ones to send to Discord and which channel should receive them, without flooding the server.'],
        ['Search', 'A searchable history', 'Filter events by server, actor, target, channel and time range, then export data when you need deeper analysis.'],
        ['Access', 'Role-aware dashboard', 'The panel uses Discord OAuth2 and RBAC controls to separate viewing, moderation and administration.'],
        ['Security', 'Built to stay isolated', 'Separate secrets, distinct database roles, private Redis, segmented Docker networks and AES-256-GCM protection for sensitive data.']
      ]
    },
    how: {
      kicker: 'HOW IT WORKS',
      title: 'From server to dashboard in three steps.',
      steps: [
        ['Add the bot', 'Authorize Sentinel with only the permissions required for the features you want to use.'],
        ['Sign in with Discord', 'The dashboard detects available servers and applies the configured access levels.'],
        ['Configure loggers', 'Choose events, destinations, retention and stored details. Panel changes remain audited.']
      ]
    },
    security: {
      kicker: 'SECURITY',
      title: 'Isolation before shortcuts.',
      intro: 'The Discord token stays inside the bot process, the API uses separate credentials, and services communicate through segmented Docker networks. Application containers run without unnecessary privileges and use read-only filesystems where supported.',
      rows: [
        ['Least privilege', 'The bot does not require the Administrator permission.'],
        ['Separate secrets', 'Tokens, sessions, database credentials and keys never reach the frontend.'],
        ['Panel audit', 'Administrative changes are recorded.'],
        ['Configurable retention', 'Keep data only for as long as you actually need it.']
      ]
    },
    cta: { title: 'Bring order to your server logs.', text: 'Add the bot, sign in with Discord and configure your first logger from the dashboard.', add: 'Add Sentinel' },
    footer: { text: 'Self-hosted logging and auditing for Discord servers, with searchable history and web configuration.', add: 'Add the bot' }
  }
} as const;

export default function PublicHome({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const home = `/${locale}`;
  const dashboard = `/${locale}/dashboard`;

  return (
    <main className="public-site" lang={locale}>
      <header className="site-header">
        <div className="site-container site-nav">
          <a className="site-brand" href={home} aria-label="Sentinel - Home">
            <span className="site-brand-mark" aria-hidden="true">S</span>
            <span>Sentinel</span>
          </a>

          <nav className="site-nav-links" aria-label={locale === 'it' ? 'Navigazione principale' : 'Main navigation'}>
            <a href="#features">{c.nav.features}</a>
            <a href="#how-it-works">{c.nav.how}</a>
            <a href="#security">{c.nav.security}</a>
            <a href={dashboard}>Dashboard</a>
          </nav>

          <LanguageSwitcher locale={locale} itHref="/it" enHref="/en" />

          <div className="site-nav-actions">
            <a className="site-button site-button-ghost site-nav-dashboard" href={dashboard}>{c.nav.signIn}</a>
            <a className="site-button site-button-primary site-nav-invite" href="/backend/bot/invite">{c.nav.add}</a>
          </div>

          <details className="site-mobile-menu">
            <summary aria-label={locale === 'it' ? 'Apri menu' : 'Open menu'}><span /><span /><span /></summary>
            <div>
              <a href="#features">{c.nav.features}</a>
              <a href="#how-it-works">{c.nav.how}</a>
              <a href="#security">{c.nav.security}</a>
              <a href={dashboard}>Dashboard</a>
              <LanguageSwitcher locale={locale} itHref="/it" enHref="/en" mobile />
              <a className="site-button site-button-primary" href="/backend/bot/invite">{c.nav.add}</a>
            </div>
          </details>
        </div>
      </header>

      <section className="site-hero">
        <div className="site-container site-hero-grid">
          <div className="site-hero-copy">
            <h1>Sentinel</h1>
            <p className="site-hero-description">
              <span>{c.hero.line1}</span>
              <span>{c.hero.line2}</span>
            </p>
            <div className="site-hero-actions">
              <a className="site-button site-button-secondary" href={dashboard}>{c.hero.dashboard}</a>
              <a className="site-button site-button-primary" href="/backend/bot/invite">{c.hero.add}</a>
            </div>
          </div>

          <div className="site-console" aria-label={c.hero.preview}>
            <div className="site-console-top">
              <span>sentinel / audit stream</span>
              <span className="site-live"><i /> LIVE</span>
            </div>
            <div className="site-console-event">
              <span className="site-event-time">20:41:18</span>
              <div><strong>member.ban</strong><p>{c.hero.removed}</p></div>
              <span className="site-event-state">{c.hero.recorded}</span>
            </div>
            <div className="site-console-event">
              <span className="site-event-time">20:38:04</span>
              <div><strong>role.update</strong><p>{c.hero.role}</p></div>
              <span className="site-event-state">{c.hero.recorded}</span>
            </div>
            <div className="site-console-event">
              <span className="site-event-time">20:33:51</span>
              <div><strong>message.delete</strong><p>{c.hero.deleted}</p></div>
              <span className="site-event-state">{c.hero.recorded}</span>
            </div>
            <div className="site-console-footer">
              <span>{c.hero.routing}</span>
              <span>{c.hero.history}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section" id="features">
        <div className="site-container">
          <div className="site-section-head">
            <div><span className="site-kicker">{c.features.kicker}</span><h2>{c.features.title}</h2></div>
            <p>{c.features.intro}</p>
          </div>
          <div className="site-feature-grid">
            {c.features.cards.map(([kicker, title, text]) => (
              <article className="site-feature-card" key={title}>
                <span>{kicker}</span><h3>{title}</h3><p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section site-section-alt" id="how-it-works">
        <div className="site-container">
          <div className="site-section-head">
            <div><span className="site-kicker">{c.how.kicker}</span><h2>{c.how.title}</h2></div>
          </div>
          <div className="site-steps">
            {c.how.steps.map(([title, text], index) => (
              <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{text}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section" id="security">
        <div className="site-container site-security">
          <div><span className="site-kicker">{c.security.kicker}</span><h2>{c.security.title}</h2><p>{c.security.intro}</p></div>
          <div className="site-security-list">
            {c.security.rows.map(([title, text]) => <div key={title}><strong>{title}</strong><span>{text}</span></div>)}
          </div>
        </div>
      </section>

      <section className="site-cta-section">
        <div className="site-container site-cta-card">
          <div><span className="site-kicker">SENTINEL</span><h2>{c.cta.title}</h2><p>{c.cta.text}</p></div>
          <div className="site-cta-actions">
            <a className="site-button site-button-secondary" href={dashboard}>Dashboard</a>
            <a className="site-button site-button-primary" href="/backend/bot/invite">{c.cta.add}</a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-container">
          <div className="site-footer-shell">
            <div className="site-footer-brand"><strong>Sentinel</strong><p>{c.footer.text}</p></div>
            <div className="site-footer-links">
              <a href="#features">{c.nav.features}</a>
              <a href="#security">{c.nav.security}</a>
              <a href={dashboard}>Dashboard</a>
              <a href="/backend/bot/invite">{c.footer.add}</a>
              <a href="https://github.com/haxurus/Sentinel" target="_blank" rel="noreferrer">GitHub</a>
            </div>
          </div>
          <div className="site-footer-bottom">
            <span>Sentinel © 2026 · Made with 💚 by Haxurus</span>
            <span>Discord Audit &amp; Logging</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
