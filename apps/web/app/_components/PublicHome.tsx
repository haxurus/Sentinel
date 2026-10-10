import { Icon, type IconName } from './Brand';
import { SiteFooter, SiteHeader } from './SiteChrome';
import type { Locale } from '../i18n';


type StreamRow = { time: string; key: string; text: string; state: 'sent' | 'stored' | 'filtered' };

const copy = {
  it: {
    nav: { features: 'Funzioni', pipeline: 'Pipeline', security: 'Sicurezza', openSource: 'Open source', pricing: 'Prezzi', beta: 'Beta', signIn: 'Accedi', add: 'Aggiungi a Discord' },
    hero: {
      kicker: 'Audit e logging per Discord',
      title: ['Ogni azione', 'sul tuo server,', 'registrata.'],
      text: 'Sentinel osserva ban, ruoli, permessi, messaggi e canali, conserva uno storico cifrato e consegna ogni evento nel canale giusto. Tu decidi cosa registrare e dove.',
      dashboard: 'Apri la dashboard',
      add: 'Aggiungi Sentinel',
      stream: 'flusso audit',
      live: 'in ascolto',
      states: { sent: 'inviato', stored: 'archiviato', filtered: 'filtrato' },
      rows: [
        ['20:41:18', 'moderation.ban', 'mod.luca → spam_bot · motivo: phishing', 'sent'],
        ['20:39:52', 'role.update', '@Staff · +Gestisci messaggi', 'sent'],
        ['20:38:04', 'channel.update', '#annunci · permessi @everyone modificati', 'sent'],
        ['20:33:51', 'message.delete', '#generale · messaggio di giulia.r', 'stored'],
        ['20:31:07', 'member.join', 'nuovo_utente · account creato 2 giorni fa', 'filtered']
      ] as const,
      footer: ['73 eventi', 'consegna ok', 'storico cifrato']
    },
    stats: [
      ['73', 'tipi di evento Discord'],
      ['AES-256', 'cifratura dello storico'],
      ['4', 'livelli di accesso RBAC'],
      ['0', 'permessi di moderazione richiesti']
    ],
    features: {
      kicker: 'Funzioni',
      title: 'Più di un canale di log.',
      intro: 'Acquisizione, conservazione e invio sono separati: puoi tenere uno storico completo senza pubblicare ogni singolo evento.',
      cards: [
        { icon: 'shield', kicker: 'Moderazione', title: 'Chi ha fatto cosa', text: 'Kick, ban, timeout, ruoli, permessi, webhook e AutoMod, con l’autore ricavato dall’Audit Log di Discord.' },
        { icon: 'message', kicker: 'Messaggi', title: 'Il contesto resta', text: 'Modifiche ed eliminazioni con il testo originale e gli allegati, grazie agli snapshot cifrati.' },
        { icon: 'route', kicker: 'Routing', title: 'Ogni evento al suo posto', text: 'Un canale per i ban, uno per i messaggi, menzioni solo dove servono. Filtri per utenti, ruoli e canali.' },
        { icon: 'search', kicker: 'Storico', title: 'Cerca ed esporta', text: 'Filtra per evento, autore, target, canale e periodo. Esporta in JSON quando devi analizzare un incidente.' },
        { icon: 'users', kicker: 'Accessi', title: 'Dashboard con ruoli', text: 'Login con Discord e livelli Viewer, Moderator, Admin e Owner verificati in tempo reale sul server.' },
        { icon: 'clock', kicker: 'Retention', title: 'Conservi solo il necessario', text: 'Retention globale o per singolo evento e cancellazione dei dati di un utente su richiesta.' }
      ]
    },
    pipeline: {
      kicker: 'Pipeline',
      title: 'Dall’evento al canale, senza perdere nulla.',
      steps: [
        { icon: 'bolt', title: 'Gateway Discord', text: 'Il bot riceve l’evento e lo arricchisce con l’autore dall’Audit Log.' },
        { icon: 'database', title: 'Storico cifrato', text: 'L’evento viene salvato prima dell’invio: un errore di consegna non cancella nulla.' },
        { icon: 'sliders', title: 'Filtri e routing', text: 'Si applicano canale di destinazione, eccezioni, menzioni e personalizzazione dell’embed.' },
        { icon: 'message', title: 'Canale di log', text: 'L’embed arriva nel canale scelto; i tentativi falliti restano visibili nella dashboard.' }
      ]
    },
    how: {
      kicker: 'Come iniziare',
      title: 'Operativo in tre passaggi.',
      steps: [
        ['Entra in beta e aggiungi il bot', 'Iscrivi il tuo server alla lista d’attesa; una volta approvato, autorizza Sentinel con i soli permessi di lettura e invio log.'],
        ['Accedi con Discord', 'La dashboard mostra i server che puoi gestire e applica i tuoi livelli di accesso.'],
        ['Scegli cosa registrare', 'Attiva i logger, scegli i canali e la retention. Ogni modifica al pannello resta tracciata.']
      ]
    },
    security: {
      kicker: 'Sicurezza',
      title: 'Progettato per non poter fare danni.',
      text: 'Un bot di log vede molto. Sentinel è costruito perché, anche se compromesso, non possa moderare né esfiltrare facilmente.',
      items: [
        ['Sola lettura', 'Una policy interna blocca ban, kick, modifiche a ruoli, canali e messaggi, indipendentemente dai permessi Discord.'],
        ['Dati cifrati', 'Contenuti, allegati e dettagli degli eventi sono cifrati con AES-256-GCM nel database.'],
        ['Segreti separati', 'Il token del bot non arriva mai al pannello web; ogni servizio ha le sue credenziali.'],
        ['Database a privilegi minimi', 'Il bot non può leggere sessioni né audit del pannello; ruoli Postgres distinti per API e bot.'],
        ['Rete segmentata', 'Database e Redis non sono esposti; ogni container vede solo i servizi che gli servono.']
      ]
    },
    openSource: {
      kicker: 'Open source',
      title: 'Il codice è aperto. Controllalo.',
      text: 'Un bot che legge il tuo server deve potersi verificare. Tutto il codice di Sentinel, dal bot alla dashboard fino agli script di deploy, è pubblico su GitHub con licenza AGPL-3.0.',
      badge: 'Open source · AGPL-3.0',
      points: [
        ['code', 'Leggi ogni riga', 'Verifica da solo cosa registra il bot, come cifra i dati e quali azioni Discord può compiere.'],
        ['database', 'Ospitalo tu', 'Fai un fork e avvia la tua istanza con Docker sulla tua infrastruttura: i dati restano tuoi.'],
        ['fork', 'Contribuisci', 'Segnala problemi o proponi modifiche. Chi offre una versione modificata come servizio deve pubblicarne il codice.']
      ],
      repo: 'Vedi il codice su GitHub',
      fork: 'Fai un fork'
    },
    cta: { title: 'Porta ordine nei log del tuo server.', text: 'Aggiungi il bot, accedi con Discord e attiva il primo logger in pochi minuti.' },
    footer: 'Logging e auditing self-hosted per server Discord.'
  },
  en: {
    nav: { features: 'Features', pipeline: 'Pipeline', security: 'Security', openSource: 'Open source', pricing: 'Pricing', beta: 'Beta', signIn: 'Sign in', add: 'Add to Discord' },
    hero: {
      kicker: 'Audit & logging for Discord',
      title: ['Every action', 'on your server,', 'on the record.'],
      text: 'Sentinel watches bans, roles, permissions, messages and channels, keeps an encrypted history and delivers every event to the right channel. You decide what gets recorded and where.',
      dashboard: 'Open dashboard',
      add: 'Add Sentinel',
      stream: 'audit stream',
      live: 'listening',
      states: { sent: 'sent', stored: 'stored', filtered: 'filtered' },
      rows: [
        ['20:41:18', 'moderation.ban', 'mod.luke → spam_bot · reason: phishing', 'sent'],
        ['20:39:52', 'role.update', '@Staff · +Manage Messages', 'sent'],
        ['20:38:04', 'channel.update', '#announcements · @everyone permissions changed', 'sent'],
        ['20:33:51', 'message.delete', '#general · message by julia.r', 'stored'],
        ['20:31:07', 'member.join', 'new_user · account created 2 days ago', 'filtered']
      ] as const,
      footer: ['73 events', 'delivery ok', 'encrypted history']
    },
    stats: [
      ['73', 'Discord event types'],
      ['AES-256', 'history encryption'],
      ['4', 'RBAC access levels'],
      ['0', 'moderation permissions required']
    ],
    features: {
      kicker: 'Features',
      title: 'More than a log channel.',
      intro: 'Collection, storage and delivery are separate, so you can keep a complete history without publishing every single event.',
      cards: [
        { icon: 'shield', kicker: 'Moderation', title: 'Who did what', text: 'Kicks, bans, timeouts, roles, permissions, webhooks and AutoMod, with the moderator resolved from Discord’s Audit Log.' },
        { icon: 'message', kicker: 'Messages', title: 'Context survives', text: 'Edits and deletions with the original text and attachments, thanks to encrypted snapshots.' },
        { icon: 'route', kicker: 'Routing', title: 'Every event in its place', text: 'One channel for bans, one for messages, mentions only where needed. Filters for users, roles and channels.' },
        { icon: 'search', kicker: 'History', title: 'Search and export', text: 'Filter by event, actor, target, channel and time range. Export to JSON when investigating an incident.' },
        { icon: 'users', kicker: 'Access', title: 'Role-aware dashboard', text: 'Discord sign-in with Viewer, Moderator, Admin and Owner levels verified live against the server.' },
        { icon: 'clock', kicker: 'Retention', title: 'Keep only what you need', text: 'Global or per-event retention, plus deletion of a user’s data on request.' }
      ]
    },
    pipeline: {
      kicker: 'Pipeline',
      title: 'From event to channel, nothing lost.',
      steps: [
        { icon: 'bolt', title: 'Discord Gateway', text: 'The bot receives the event and resolves the actor from the Audit Log.' },
        { icon: 'database', title: 'Encrypted history', text: 'The event is stored before delivery: a failed send never deletes anything.' },
        { icon: 'sliders', title: 'Filters & routing', text: 'Destination channel, exceptions, mentions and embed customisation are applied.' },
        { icon: 'message', title: 'Log channel', text: 'The embed lands in the chosen channel; failed attempts stay visible in the dashboard.' }
      ]
    },
    how: {
      kicker: 'Getting started',
      title: 'Up and running in three steps.',
      steps: [
        ['Join the beta and add the bot', 'Put your server on the waitlist; once approved, authorise Sentinel with read and log-delivery permissions only.'],
        ['Sign in with Discord', 'The dashboard lists the servers you can manage and applies your access level.'],
        ['Choose what to record', 'Enable loggers, pick channels and retention. Every panel change is audited.']
      ]
    },
    security: {
      kicker: 'Security',
      title: 'Built so it cannot do damage.',
      text: 'A logging bot sees a lot. Sentinel is designed so that, even if compromised, it cannot moderate and cannot easily exfiltrate.',
      items: [
        ['Read-only', 'An internal policy blocks bans, kicks and changes to roles, channels and messages, regardless of Discord permissions.'],
        ['Encrypted data', 'Message content, attachments and event details are encrypted with AES-256-GCM at rest.'],
        ['Separated secrets', 'The bot token never reaches the web panel; every service has its own credentials.'],
        ['Least-privilege database', 'The bot cannot read sessions or panel audit; distinct Postgres roles for API and bot.'],
        ['Segmented network', 'Database and Redis are never exposed; each container only reaches what it needs.']
      ]
    },
    openSource: {
      kicker: 'Open source',
      title: 'The code is open. Check it.',
      text: 'A bot that reads your server should be verifiable. All of Sentinel — bot, dashboard and deployment scripts — is public on GitHub under the AGPL-3.0 licence.',
      badge: 'Open source · AGPL-3.0',
      points: [
        ['code', 'Read every line', 'See for yourself what the bot records, how it encrypts data and which Discord actions it can take.'],
        ['database', 'Host it yourself', 'Fork it and run your own instance with Docker on your infrastructure: your data stays yours.'],
        ['fork', 'Contribute', 'Report issues or propose changes. Anyone offering a modified version as a service must publish its source.']
      ],
      repo: 'View the code on GitHub',
      fork: 'Fork it'
    },
    cta: { title: 'Bring order to your server logs.', text: 'Add the bot, sign in with Discord and enable your first logger in minutes.' },
    footer: 'Self-hosted logging and auditing for Discord servers.'
  }
} as const;

export default function PublicHome({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const dashboard = `/${locale}/dashboard`;
  const invite = `/backend/bot/invite?lang=${locale}`;
  const repo = 'https://github.com/haxurus/Sentinel';
  const rows = c.hero.rows as readonly (readonly [string, string, string, StreamRow['state']])[];

  return (
    <main className="public-site" lang={locale}>
      <SiteHeader
        locale={locale}
        itHref="/it"
        enHref="/en"
        links={[
          { href: '#features', label: c.nav.features },
          { href: '#security', label: c.nav.security },
          { href: '#open-source', label: c.nav.openSource },
          { href: `/${locale}/pricing`, label: c.nav.pricing },
          { href: `/${locale}/beta`, label: c.nav.beta }
        ]}
        actions={<>
          <a className="button button-ghost" href={dashboard}>{c.nav.signIn}</a>
          <a className="button button-primary" href={invite}>{c.nav.add}</a>
        </>}
      />

      <section className="hero">
        <div className="site-container hero-grid">
          <div className="hero-copy">
            <span className="kicker">{c.hero.kicker}</span>
            <h1>{c.hero.title.map((line) => <span key={line}>{line}</span>)}</h1>
            <p>{c.hero.text}</p>
            <div className="hero-actions">
              <a className="button button-primary button-lg" href={invite}>{c.hero.add}<Icon name="arrowRight" size={16} /></a>
              <a className="button button-secondary button-lg" href={dashboard}>{c.hero.dashboard}</a>
            </div>
            <a className="oss-badge" href={repo} target="_blank" rel="noreferrer"><Icon name="github" size={15} />{c.openSource.badge}<Icon name="arrowRight" size={13} /></a>
          </div>

          <div className="stream" aria-label={c.hero.stream}>
            <div className="stream-top">
              <span className="mono">sentinel://{c.hero.stream}</span>
              <span className="live"><i />{c.hero.live}</span>
            </div>
            <ol className="stream-rows">
              {rows.map(([time, key, text, state]) => (
                <li key={key + time}>
                  <time className="mono">{time}</time>
                  <div><strong className="mono">{key}</strong><span>{text}</span></div>
                  <span className={`state state-${state}`}>{c.hero.states[state]}</span>
                </li>
              ))}
            </ol>
            <div className="stream-bottom mono">
              {c.hero.footer.map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>
        </div>

        <div className="site-container stat-strip">
          {c.stats.map(([value, label]) => (
            <div key={label}><strong>{value}</strong><span>{label}</span></div>
          ))}
        </div>
      </section>

      <section className="section" id="features">
        <div className="site-container">
          <div className="section-head">
            <span className="kicker">{c.features.kicker}</span>
            <h2>{c.features.title}</h2>
            <p>{c.features.intro}</p>
          </div>
          <div className="feature-grid">
            {c.features.cards.map((card) => (
              <article className="feature" key={card.title}>
                <div className="feature-icon"><Icon name={card.icon} size={20} /></div>
                <span className="feature-kicker">{card.kicker}</span>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt" id="pipeline">
        <div className="site-container">
          <div className="section-head">
            <span className="kicker">{c.pipeline.kicker}</span>
            <h2>{c.pipeline.title}</h2>
          </div>
          <ol className="pipeline">
            {c.pipeline.steps.map((step, index) => (
              <li key={step.title}>
                <div className="pipeline-node"><Icon name={step.icon} size={20} /><span className="mono">{String(index + 1).padStart(2, '0')}</span></div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="site-container steps-layout">
          <div className="section-head">
            <span className="kicker">{c.how.kicker}</span>
            <h2>{c.how.title}</h2>
          </div>
          <ol className="steps">
            {c.how.steps.map(([title, text], index) => (
              <li key={title}>
                <span className="step-index mono">{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section-alt" id="security">
        <div className="site-container security-layout">
          <div className="section-head">
            <span className="kicker">{c.security.kicker}</span>
            <h2>{c.security.title}</h2>
            <p>{c.security.text}</p>
          </div>
          <dl className="security-list">
            {c.security.items.map(([title, text]) => (
              <div key={title}><dt><Icon name="check" size={16} />{title}</dt><dd>{text}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section" id="open-source">
        <div className="site-container oss-layout">
          <div className="section-head">
            <span className="kicker">{c.openSource.kicker}</span>
            <h2>{c.openSource.title}</h2>
            <p>{c.openSource.text}</p>
            <div className="oss-actions">
              <a className="button button-primary button-lg" href={repo} target="_blank" rel="noreferrer"><Icon name="github" size={17} />{c.openSource.repo}</a>
              <a className="button button-secondary button-lg" href={`${repo}/fork`} target="_blank" rel="noreferrer"><Icon name="fork" size={16} />{c.openSource.fork}</a>
            </div>
          </div>
          <div className="oss-card">
            <a className="oss-repo mono" href={repo} target="_blank" rel="noreferrer"><Icon name="github" size={16} />github.com/haxurus/Sentinel</a>
            <ul>
              {c.openSource.points.map(([icon, title, text]) => (
                <li key={title}><span className="feature-icon"><Icon name={icon as IconName} size={18} /></span><div><h3>{title}</h3><p>{text}</p></div></li>
              ))}
            </ul>
            <span className="oss-license mono">AGPL-3.0-only</span>
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <div className="site-container cta">
          <div><h2>{c.cta.title}</h2><p>{c.cta.text}</p></div>
          <div className="cta-actions">
            <a className="button button-primary button-lg" href={invite}>{c.hero.add}<Icon name="arrowRight" size={16} /></a>
            <a className="button button-secondary button-lg" href={dashboard}>{c.hero.dashboard}</a>
          </div>
        </div>
      </section>

      <SiteFooter locale={locale}>
        <div className="footer-main">
          <p>{c.footer}</p>
          <nav>
            <a href="#features">{c.nav.features}</a>
            <a href={dashboard}>Dashboard</a>
            <a href={`/${locale}/pricing`}>{c.nav.pricing}</a>
            <a href={`/${locale}/beta`}>{c.nav.beta}</a>
            <a href={invite}>{c.nav.add}</a>
            <a href={repo} target="_blank" rel="noreferrer">{c.openSource.badge}</a>
          </nav>
        </div>
      </SiteFooter>
    </main>
  );
}
