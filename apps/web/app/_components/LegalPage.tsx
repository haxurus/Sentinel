import { SiteFooter, SiteHeader } from './SiteChrome';
import type { Locale } from '../i18n';

type Section = { title: string; body: Array<string | string[]> };
type Doc = { id: string; kicker: string; title: string; intro: string; sections: Section[] };

const CONTACT = 'haxurus@icloud.com';
const UPDATED = { it: '11 ottobre 2026', en: '11 October 2026' };

const copy: Record<Locale, { kicker: string; title: string; intro: string; updated: string; toc: string; docs: Doc[]; home: string; pricing: string }> = {
  en: {
    kicker: 'Legal',
    title: 'Privacy policy and terms of service',
    intro: 'This page explains what data Sentinel processes, why, for how long and what rights you have, and the terms for using the hosted bot and dashboard at sentinel.haxurus.com.',
    updated: 'Last updated',
    toc: 'On this page',
    home: 'Home',
    pricing: 'Pricing',
    docs: [
      {
        id: 'privacy',
        kicker: 'Privacy',
        title: 'Privacy policy',
        intro: 'Sentinel is a Discord logging bot. It records what happens on the Discord servers where administrators add it, so that those administrators can review moderation and server activity.',
        sections: [
          { title: 'Who is responsible', body: [
            `The hosted Sentinel service is operated by Haxurus ("we"). Contact: ${CONTACT}.`,
            'The administrators of each Discord server decide whether to add Sentinel and which events to record; we process that data to provide the service to them. If you are a member of a server that uses Sentinel, you can also contact that server’s administrators.'
          ] },
          { title: 'Data we process', body: [
            'From the Discord servers where the bot is installed, only for the events the server’s administrators enable:',
            [
              'server, channel and role identifiers and names, server icon;',
              'user identifiers, usernames, nicknames, avatars and roles of the members involved in an event (who acted and who was affected);',
              'message content, attachment names and links and embeds, to show edited and deleted messages;',
              'moderation actions and their reasons from the Discord Audit Log, member joins and leaves, voice activity, invites, AutoMod actions and server configuration changes;',
              'on paid plans and only if enabled: new messages, reactions, presence (status and activity), typing and raw Gateway events.'
            ],
            'When you sign in to the dashboard with Discord: your Discord user ID, username, avatar and the list of servers you belong to (scopes identify and guilds), plus a log of the changes you make in the panel with a one-way hash of your IP address.',
            'Technical data: our web server and Cloudflare, which protects and delivers the site, process IP addresses and request data to deliver pages and prevent abuse.'
          ] },
          { title: 'Why we process it', body: [
            [
              'to record and display server events and post them to the log channels chosen by the administrators;',
              'to let authorised people sign in to the dashboard and manage their servers;',
              'to keep the service secure, prevent abuse and enforce these terms;',
              'to manage plans requested by server administrators.'
            ],
            'Under the GDPR the legal basis is the legitimate interest of server administrators and of the operator in moderating communities and running a secure service (Art. 6(1)(f)), and the performance of the service requested by dashboard users (Art. 6(1)(b)).'
          ] },
          { title: 'How long we keep it', body: [
            [
              'Server events and message snapshots: for the retention period chosen by the server’s administrators, within the limit of the server’s plan (15 to 90 days), then deleted automatically. If the bot is removed from a server, its data keeps expiring on the same schedule.',
              'Dashboard sessions: 8 hours.',
              'Panel change log: for the same retention period as the server’s events.',
              'Database backups: up to 14 days.'
            ]
          ] },
          { title: 'How we protect it', body: [
            'Message content, attachments, embeds and event details are encrypted at rest with AES-256-GCM. Session tokens are stored only as hashes. The bot cannot perform moderation actions, and each component has its own database permissions. The code is open source, so these measures can be verified on GitHub.'
          ] },
          { title: 'Sharing', body: [
            'We do not sell data and we do not use it for advertising or profiling. Data is shared only with the providers needed to run the service: Discord (the platform the bot works on), Cloudflare (network delivery and protection) and our hosting provider. Log messages are posted only in the channels configured by each server’s administrators.'
          ] },
          { title: 'Cookies', body: [
            'We use only strictly necessary cookies: a session cookie when you sign in, and short-lived cookies (10 minutes) that protect the Discord sign-in and remember your language. There are no analytics or advertising cookies.'
          ] },
          { title: 'Your rights', body: [
            `You can ask to access, correct or delete your data, to restrict or object to its processing and to receive a copy of it, by writing to ${CONTACT}. Server administrators can also delete all data about a user from the dashboard. You have the right to lodge a complaint with your data protection authority (in Italy, the Garante per la protezione dei dati personali).`,
            'Sentinel is meant for Discord users who meet Discord’s minimum age requirements.'
          ] },
          { title: 'Changes', body: [
            'We will update this page when the way we process data changes, and the date at the top will change accordingly.'
          ] }
        ]
      },
      {
        id: 'terms',
        kicker: 'Terms',
        title: 'Terms of service',
        intro: 'By adding Sentinel to a Discord server or using its dashboard you agree to these terms.',
        sections: [
          { title: 'The service', body: [
            'Sentinel is a Discord bot and web dashboard that records server events and posts them to log channels. The hosted service is provided by Haxurus. The source code is published under the AGPL-3.0 licence; these terms govern the hosted service, not your use of the code.'
          ] },
          { title: 'Your responsibilities', body: [
            [
              'You must comply with Discord’s Terms of Service, Community Guidelines and Developer Policy.',
              'If you add Sentinel to a server, you must be authorised to manage it and you are responsible for how you configure logging, including informing your members that the server is logged where required.',
              'Do not use Sentinel to harass, stalk or unlawfully monitor people, or to collect data for purposes other than moderating your server.',
              'Do not attempt to disrupt, overload, reverse-engineer the hosted service or bypass its limits and security measures.'
            ]
          ] },
          { title: 'Plans and payments', body: [
            'The Free plan is available to everyone. Paid plans (Plus, Pro, Brand) are activated by the operator after you request them; online payments are not available yet, so prices and payment are agreed directly with you before activation, and any refund is agreed case by case without prejudice to your statutory rights. When a paid plan expires, the server returns to the Free plan: features outside it are switched off and its limits apply, but your configuration is not deleted.'
          ] },
          { title: 'Availability', body: [
            'We work to keep Sentinel available and reliable, but the service is provided “as is” and “as available”, without guaranteed uptime. Discord outages, missing bot permissions or maintenance can delay or prevent logs.'
          ] },
          { title: 'Suspension and termination', body: [
            'You can stop using Sentinel at any time by removing the bot from your server. We may block a server or user, or make the bot leave a server, if these terms or Discord’s rules are breached or to protect the service and its users.'
          ] },
          { title: 'Liability', body: [
            'To the extent permitted by law, the operator is not liable for indirect damages or for the loss of data or logs. Nothing in these terms limits liability that cannot be limited by law, including your rights as a consumer.'
          ] },
          { title: 'Changes and governing law', body: [
            'We may update these terms; the date at the top of this page shows the latest version, and continuing to use the service means you accept it. These terms are governed by Italian law, without prejudice to the mandatory consumer protection rules of your country of residence.',
            `Questions: ${CONTACT}.`
          ] }
        ]
      }
    ]
  },
  it: {
    kicker: 'Note legali',
    title: 'Privacy policy e termini di servizio',
    intro: 'Questa pagina spiega quali dati tratta Sentinel, perché, per quanto tempo e quali diritti hai, e le condizioni per usare il bot e la dashboard ospitati su sentinel.haxurus.com.',
    updated: 'Ultimo aggiornamento',
    toc: 'In questa pagina',
    home: 'Home',
    pricing: 'Prezzi',
    docs: [
      {
        id: 'privacy',
        kicker: 'Privacy',
        title: 'Privacy policy',
        intro: 'Sentinel è un bot di log per Discord. Registra ciò che accade nei server Discord in cui gli amministratori lo aggiungono, così che possano controllare la moderazione e l’attività del server.',
        sections: [
          { title: 'Chi è responsabile', body: [
            `Il servizio ospitato di Sentinel è gestito da Haxurus ("noi"). Contatto: ${CONTACT}.`,
            'Gli amministratori di ciascun server Discord decidono se aggiungere Sentinel e quali eventi registrare; noi trattiamo quei dati per fornire loro il servizio. Se sei membro di un server che usa Sentinel puoi rivolgerti anche agli amministratori di quel server.'
          ] },
          { title: 'Quali dati trattiamo', body: [
            'Dai server Discord in cui il bot è installato, solo per gli eventi attivati dagli amministratori:',
            [
              'identificativi e nomi di server, canali e ruoli, icona del server;',
              'identificativi, username, nickname, avatar e ruoli dei membri coinvolti in un evento (chi ha agito e chi l’ha subito);',
              'contenuto dei messaggi, nomi e link degli allegati ed embed, per mostrare i messaggi modificati ed eliminati;',
              'azioni di moderazione e relativi motivi dall’Audit Log di Discord, ingressi e uscite, attività vocale, inviti, azioni AutoMod e modifiche alla configurazione del server;',
              'solo nei piani a pagamento e se attivati: nuovi messaggi, reazioni, presenza (stato e attività), digitazione ed eventi Gateway grezzi.'
            ],
            'Quando accedi alla dashboard con Discord: il tuo ID utente, username, avatar e l’elenco dei server di cui fai parte (scope identify e guilds), più un registro delle modifiche che fai nel pannello con un hash non reversibile del tuo indirizzo IP.',
            'Dati tecnici: il nostro server web e Cloudflare, che protegge e distribuisce il sito, trattano indirizzi IP e dati delle richieste per mostrare le pagine e prevenire abusi.'
          ] },
          { title: 'Perché li trattiamo', body: [
            [
              'per registrare e mostrare gli eventi del server e pubblicarli nei canali di log scelti dagli amministratori;',
              'per consentire alle persone autorizzate di accedere alla dashboard e gestire i propri server;',
              'per mantenere il servizio sicuro, prevenire abusi e far rispettare questi termini;',
              'per gestire i piani richiesti dagli amministratori dei server.'
            ],
            'Ai sensi del GDPR la base giuridica è il legittimo interesse degli amministratori dei server e del gestore a moderare le community e a offrire un servizio sicuro (art. 6.1.f), e l’esecuzione del servizio richiesto da chi usa la dashboard (art. 6.1.b).'
          ] },
          { title: 'Per quanto tempo li conserviamo', body: [
            [
              'Eventi e snapshot dei messaggi: per il periodo di conservazione scelto dagli amministratori, entro il limite del piano del server (da 15 a 90 giorni), poi vengono cancellati automaticamente. Se il bot viene rimosso da un server, i dati continuano a scadere con le stesse regole.',
              'Sessioni della dashboard: 8 ore.',
              'Registro delle modifiche al pannello: per lo stesso periodo degli eventi del server.',
              'Backup del database: fino a 14 giorni.'
            ]
          ] },
          { title: 'Come li proteggiamo', body: [
            'Contenuto dei messaggi, allegati, embed e dettagli degli eventi sono cifrati con AES-256-GCM. I token di sessione sono salvati solo come hash. Il bot non può eseguire azioni di moderazione e ogni componente ha permessi separati sul database. Il codice è open source, quindi queste misure sono verificabili su GitHub.'
          ] },
          { title: 'Condivisione', body: [
            'Non vendiamo i dati e non li usiamo per pubblicità o profilazione. Li condividiamo solo con i fornitori necessari al servizio: Discord (la piattaforma su cui opera il bot), Cloudflare (distribuzione e protezione di rete) e il nostro fornitore di hosting. I messaggi di log vengono pubblicati solo nei canali configurati dagli amministratori di ciascun server.'
          ] },
          { title: 'Cookie', body: [
            'Usiamo solo cookie tecnici necessari: un cookie di sessione quando accedi e cookie di breve durata (10 minuti) che proteggono l’accesso con Discord e ricordano la lingua. Non ci sono cookie di statistica o pubblicità.'
          ] },
          { title: 'I tuoi diritti', body: [
            `Puoi chiedere di accedere ai tuoi dati, rettificarli o cancellarli, limitarne od opporti al trattamento e riceverne una copia scrivendo a ${CONTACT}. Gli amministratori dei server possono anche cancellare dalla dashboard tutti i dati relativi a un utente. Hai il diritto di presentare reclamo all’autorità di controllo (in Italia, il Garante per la protezione dei dati personali).`,
            'Sentinel è destinato agli utenti Discord che rispettano l’età minima richiesta da Discord.'
          ] },
          { title: 'Modifiche', body: [
            'Aggiorneremo questa pagina quando cambierà il modo in cui trattiamo i dati, e la data in alto cambierà di conseguenza.'
          ] }
        ]
      },
      {
        id: 'terms',
        kicker: 'Termini',
        title: 'Termini di servizio',
        intro: 'Aggiungendo Sentinel a un server Discord o usando la sua dashboard accetti questi termini.',
        sections: [
          { title: 'Il servizio', body: [
            'Sentinel è un bot Discord con dashboard web che registra gli eventi del server e li pubblica in canali di log. Il servizio ospitato è fornito da Haxurus. Il codice sorgente è pubblicato con licenza AGPL-3.0; questi termini regolano il servizio ospitato, non l’uso del codice.'
          ] },
          { title: 'Le tue responsabilità', body: [
            [
              'Devi rispettare i Termini di servizio, le Linee guida della community e la Developer Policy di Discord.',
              'Se aggiungi Sentinel a un server devi essere autorizzato a gestirlo e sei responsabile di come configuri i log, incluso informare i membri che il server è registrato quando è richiesto.',
              'Non usare Sentinel per molestare, perseguitare o controllare illecitamente persone, né per raccogliere dati per scopi diversi dalla moderazione del tuo server.',
              'Non tentare di interrompere, sovraccaricare o decodificare il servizio ospitato, né di aggirarne limiti e misure di sicurezza.'
            ]
          ] },
          { title: 'Piani e pagamenti', body: [
            'Il piano Free è disponibile per tutti. I piani a pagamento (Plus, Pro, Brand) vengono attivati dal gestore su tua richiesta; i pagamenti online non sono ancora disponibili, quindi prezzo e modalità di pagamento vengono concordati direttamente con te prima dell’attivazione, e gli eventuali rimborsi caso per caso, fatti salvi i diritti previsti dalla legge. Alla scadenza di un piano a pagamento il server torna al piano Free: le funzioni non incluse vengono disattivate e si applicano i suoi limiti, ma la configurazione non viene cancellata.'
          ] },
          { title: 'Disponibilità', body: [
            'Lavoriamo per mantenere Sentinel disponibile e affidabile, ma il servizio è fornito “così com’è” e “come disponibile”, senza garanzie di continuità. Disservizi di Discord, permessi mancanti del bot o manutenzioni possono ritardare o impedire i log.'
          ] },
          { title: 'Sospensione e cessazione', body: [
            'Puoi smettere di usare Sentinel in qualsiasi momento rimuovendo il bot dal tuo server. Possiamo bloccare un server o un utente, o far uscire il bot da un server, in caso di violazione di questi termini o delle regole di Discord, o per proteggere il servizio e i suoi utenti.'
          ] },
          { title: 'Responsabilità', body: [
            'Nei limiti consentiti dalla legge, il gestore non risponde di danni indiretti né della perdita di dati o log. Nulla in questi termini limita responsabilità che per legge non possono essere limitate, inclusi i tuoi diritti di consumatore.'
          ] },
          { title: 'Modifiche e legge applicabile', body: [
            'Possiamo aggiornare questi termini; la data in alto indica la versione in vigore e continuare a usare il servizio significa accettarla. Questi termini sono regolati dalla legge italiana, fatte salve le norme inderogabili a tutela dei consumatori del Paese di residenza.',
            `Domande: ${CONTACT}.`
          ] }
        ]
      }
    ]
  }
};

const slug = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function Paragraphs({ body }: { body: Section['body'] }) {
  return <>{body.map((item, index) => Array.isArray(item)
    ? <ul key={index}>{item.map((line) => <li key={line}>{line}</li>)}</ul>
    : <p key={index}>{item}</p>)}</>;
}

export default function LegalPage({ locale }: { locale: Locale }) {
  const c = copy[locale];
  return (
    <main className="public-site" lang={locale}>
      <SiteHeader
        locale={locale}
        itHref="/it/legal"
        enHref="/en/legal"
        links={[{ href: `/${locale}`, label: c.home }, { href: `/${locale}/pricing`, label: c.pricing }]}
      />
      <section className="page legal-page">
        <div className="site-container legal-layout">
          <aside className="legal-toc">
            <span className="kicker">{c.toc}</span>
            {c.docs.map((doc) => (
              <nav key={doc.id} aria-label={doc.title}>
                <a className="legal-toc-doc" href={`#${doc.id}`}>{doc.title}</a>
                {doc.sections.map((section) => <a key={section.title} href={`#${doc.id}-${slug(section.title)}`}>{section.title}</a>)}
              </nav>
            ))}
          </aside>
          <div className="legal-content">
            <header className="legal-head">
              <span className="kicker">{c.kicker}</span>
              <h1>{c.title}</h1>
              <p>{c.intro}</p>
              <p className="legal-updated mono">{c.updated}: {UPDATED[locale]}</p>
            </header>
            {c.docs.map((doc) => (
              <article className="legal-doc" id={doc.id} key={doc.id}>
                <span className="kicker">{doc.kicker}</span>
                <h2>{doc.title}</h2>
                <p className="legal-intro">{doc.intro}</p>
                {doc.sections.map((section) => (
                  <section key={section.title} id={`${doc.id}-${slug(section.title)}`}>
                    <h3>{section.title}</h3>
                    <Paragraphs body={section.body} />
                  </section>
                ))}
              </article>
            ))}
          </div>
        </div>
      </section>
      <SiteFooter locale={locale} />
    </main>
  );
}
