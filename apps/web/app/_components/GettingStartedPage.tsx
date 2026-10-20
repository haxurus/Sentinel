import { SiteFooter, SiteHeader } from './SiteChrome';
import { StructuredData } from './StructuredData';
import { SITE_URL } from './seo';
import type { Locale } from '../i18n';

const SUPPORT_SERVER = 'https://discord.gg/DDBGWP5fMX';

type Step = { id: string; title: string; body: Array<string | string[]> };

const copy: Record<Locale, {
  kicker: string; title: string; intro: string; toc: string; home: string; pricing: string; dashboard: string;
  add: string; open: string; steps: Step[]; states: { title: string; rows: Array<[string, string]> }; help: { title: string; text: string; support: string; issues: string };
}> = {
  en: {
    kicker: 'Guide',
    title: 'Getting started with Sentinel',
    intro: 'Sentinel is set up entirely from the web dashboard: there are no commands to learn. These steps take about five minutes.',
    toc: 'Steps',
    home: 'Home',
    pricing: 'Pricing',
    dashboard: 'Dashboard',
    add: 'Add to Discord',
    open: 'Open the dashboard',
    steps: [
      { id: 'add', title: '1. Add Sentinel to your server', body: [
        'Use the “Add to Discord” button and choose the server. You need the Manage Server permission there.',
        'Discord shows the permissions Sentinel asks for. Keep them all: Sentinel is read-only and never needs Administrator.',
        ['View Channels, Read Message History: to see the events to record;', 'Send Messages, Embed Links: to post logs in your log channels;', 'View Audit Log: to show who performed an action;', 'Change Nickname: used only by the Brand plan for a custom bot name.']
      ] },
      { id: 'dashboard', title: '2. Open the dashboard', body: [
        'Sign in with Discord and pick your server. You see every server where you are the owner or have Administrator or Manage Server; other members can get Moderator or Viewer access if an admin links one of their roles.'
      ] },
      { id: 'channel', title: '3. Choose a default log channel', body: [
        'In Overview, choose the channel that receives logs by default. In that channel Sentinel must be able to view the channel, send messages and embed links.',
        'Tip: create a private channel visible only to your staff, for example #sentinel-logs.'
      ] },
      { id: 'loggers', title: '4. Turn on the loggers you need', body: [
        'In the Logger tab, loggers are grouped by area: members and moderation, messages, server structure, voice, content, automation and system.',
        'Each logger has two switches: collection stores the event in the history, delivery posts it to Discord. You can keep a full history without flooding your channels.',
        'Every logger can have its own channel, colour, title, role mentions, retention and exceptions for users, roles and channels, plus an “ignore bots” option.'
      ] },
      { id: 'history', title: '5. Check the history', body: [
        'History lists every recorded event with its delivery state, so you can see at once why a log did not reach Discord. You can filter by event, search by text or by a user or channel ID, and export to JSON.'
      ] },
      { id: 'team', title: '6. Give access to your team', body: [
        'In Administration, link Discord roles to the Viewer, Moderator or Admin levels. Levels are checked live against the server, so removing a role removes the access.'
      ] }
    ],
    states: { title: 'Delivery states', rows: [
      ['SENT', 'Posted to Discord.'],
      ['DISABLED', 'Delivery is off for that logger.'],
      ['FILTERED', 'Skipped by an exception (ignored user, role or channel, or “ignore bots”).'],
      ['NO_DESTINATION', 'The logger has no channel and there is no default log channel.'],
      ['CHANNEL_UNAVAILABLE', 'The channel was deleted, or Sentinel cannot see it or write in it.'],
      ['PREMIUM_REQUIRED', 'The logger is not included in the server’s plan.'],
      ['FAILED', 'Discord rejected the message even after retries.']
    ] },
    help: {
      title: 'Need help?',
      text: 'Ask on the support server, including your server ID and the event you are looking at. Bugs and ideas go to GitHub.',
      support: 'Support server',
      issues: 'Report a bug or suggest a feature'
    }
  },
  it: {
    kicker: 'Guida',
    title: 'Primi passi con Sentinel',
    intro: 'Sentinel si configura interamente dalla dashboard web: non ci sono comandi da imparare. Bastano circa cinque minuti.',
    toc: 'Passaggi',
    home: 'Home',
    pricing: 'Prezzi',
    dashboard: 'Dashboard',
    add: 'Aggiungi a Discord',
    open: 'Apri la dashboard',
    steps: [
      { id: 'add', title: '1. Aggiungi Sentinel al server', body: [
        'Usa il pulsante “Aggiungi a Discord” e scegli il server. Serve il permesso Gestisci server.',
        'Discord mostra i permessi richiesti da Sentinel. Lasciali tutti: Sentinel è in sola lettura e non ha mai bisogno di Amministratore.',
        ['Visualizza canali, Leggi cronologia messaggi: per vedere gli eventi da registrare;', 'Invia messaggi, Incorpora link: per pubblicare i log nei canali scelti;', 'Visualizza registro attività: per mostrare chi ha eseguito un’azione;', 'Cambia nickname: usato solo dal piano Brand per il nome personalizzato del bot.']
      ] },
      { id: 'dashboard', title: '2. Apri la dashboard', body: [
        'Accedi con Discord e scegli il server. Vedi tutti i server di cui sei proprietario o in cui hai Amministratore o Gestisci server; gli altri membri possono avere accesso Moderator o Viewer se un admin collega uno dei loro ruoli.'
      ] },
      { id: 'channel', title: '3. Scegli un canale di log predefinito', body: [
        'In Panoramica scegli il canale che riceve i log in modo predefinito. In quel canale Sentinel deve poter vedere il canale, inviare messaggi e incorporare link.',
        'Consiglio: crea un canale privato visibile solo allo staff, per esempio #sentinel-logs.'
      ] },
      { id: 'loggers', title: '4. Attiva i logger che ti servono', body: [
        'Nella scheda Logger i logger sono raggruppati per area: membri e moderazione, messaggi, struttura del server, voce, contenuti, automazioni e sistema.',
        'Ogni logger ha due interruttori: l’acquisizione salva l’evento nello storico, l’invio lo pubblica su Discord. Puoi tenere uno storico completo senza riempire i canali.',
        'Ogni logger può avere canale, colore, titolo, menzioni di ruoli, conservazione ed eccezioni per utenti, ruoli e canali, più l’opzione “ignora bot”.'
      ] },
      { id: 'history', title: '5. Controlla lo storico', body: [
        'Lo storico elenca ogni evento registrato con il suo stato di consegna, così vedi subito perché un log non è arrivato su Discord. Puoi filtrare per evento, cercare per testo o per ID di utente o canale ed esportare in JSON.'
      ] },
      { id: 'team', title: '6. Dai accesso al tuo staff', body: [
        'In Amministrazione collega i ruoli Discord ai livelli Viewer, Moderator o Admin. I livelli sono verificati in tempo reale sul server: togliendo il ruolo si toglie l’accesso.'
      ] }
    ],
    states: { title: 'Stati di consegna', rows: [
      ['SENT', 'Pubblicato su Discord.'],
      ['DISABLED', 'L’invio è disattivato per quel logger.'],
      ['FILTERED', 'Saltato da un’eccezione (utente, ruolo o canale ignorato, oppure “ignora bot”).'],
      ['NO_DESTINATION', 'Il logger non ha un canale e non c’è un canale di log predefinito.'],
      ['CHANNEL_UNAVAILABLE', 'Il canale è stato eliminato, oppure Sentinel non può vederlo o scriverci.'],
      ['PREMIUM_REQUIRED', 'Il logger non è incluso nel piano del server.'],
      ['FAILED', 'Discord ha rifiutato il messaggio anche dopo i tentativi.']
    ] },
    help: {
      title: 'Serve aiuto?',
      text: 'Chiedi sul server di supporto indicando l’ID del server e l’evento che stai guardando. Bug e idee vanno su GitHub.',
      support: 'Server di supporto',
      issues: 'Segnala un bug o proponi una funzione'
    }
  }
};

function Paragraphs({ body }: { body: Step['body'] }) {
  return <>{body.map((item, index) => Array.isArray(item)
    ? <ul key={index}>{item.map((line) => <li key={line}>{line}</li>)}</ul>
    : <p key={index}>{item}</p>)}</>;
}

export default function GettingStartedPage({ locale }: { locale: Locale }) {
  const c = copy[locale];
  return (
    <main className="public-site" lang={locale}>
      <StructuredData data={{
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: c.title,
        description: c.intro,
        url: `${SITE_URL}/${locale}/getting-started`,
        step: c.steps.map((step) => ({ '@type': 'HowToStep', name: step.title.replace(/^\d+\.\s*/, ''), text: step.body.flat().join(' ') }))
      }} />
      <SiteHeader
        locale={locale}
        itHref="/it/getting-started"
        enHref="/en/getting-started"
        links={[{ href: `/${locale}`, label: c.home }, { href: `/${locale}/pricing`, label: c.pricing }, { href: `/${locale}/dashboard`, label: c.dashboard }]}
      />
      <section className="page legal-page">
        <div className="site-container legal-layout">
          <aside className="legal-toc">
            <span className="kicker">{c.toc}</span>
            <nav aria-label={c.toc}>
              {c.steps.map((step) => <a key={step.id} href={`#${step.id}`}>{step.title}</a>)}
              <a href="#states">{c.states.title}</a>
              <a href="#help">{c.help.title}</a>
            </nav>
          </aside>
          <div className="legal-content">
            <header className="legal-head">
              <span className="kicker">{c.kicker}</span>
              <h1>{c.title}</h1>
              <p>{c.intro}</p>
              <div className="guide-actions">
                <a className="button button-primary" href={`/backend/bot/invite?lang=${locale}`}>{c.add}</a>
                <a className="button button-secondary" href={`/${locale}/dashboard`}>{c.open}</a>
              </div>
            </header>
            <article className="legal-doc">
              {c.steps.map((step) => (
                <section key={step.id} id={step.id}>
                  <h3>{step.title}</h3>
                  <Paragraphs body={step.body} />
                </section>
              ))}
              <section id="states">
                <h3>{c.states.title}</h3>
                <ul className="guide-states">
                  {c.states.rows.map(([state, text]) => <li key={state}><code>{state}</code> {text}</li>)}
                </ul>
              </section>
              <section id="help">
                <h3>{c.help.title}</h3>
                <p>{c.help.text}</p>
                <div className="guide-actions">
                  <a className="button button-secondary" href={SUPPORT_SERVER} target="_blank" rel="noreferrer">{c.help.support}</a>
                  <a className="button button-ghost" href="https://github.com/haxurus/Sentinel/issues/new/choose" target="_blank" rel="noreferrer">{c.help.issues}</a>
                </div>
              </section>
            </article>
          </div>
        </div>
      </section>
      <SiteFooter locale={locale} />
    </main>
  );
}
