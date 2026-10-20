'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from './Brand';
import { SiteHeader } from './SiteChrome';
import type { Locale } from '../i18n';
import { TIER_ORDER, formatPrice, tierLabel, type DiscordStore, type PaidTier, type Plan, type PlanTier, type StorePeriod } from './plans';

type GuildPlan = {
  planTier: PlanTier;
  planBilling: string | null;
  planExpiresAt: string | null;
  planSource: string;
  planNote: string | null;
  planUpdatedAt: string | null;
} | null;

type Guild = {
  id: string;
  name: string;
  ownerId: string;
  ownerTag: string | null;
  memberCount: number;
  iconUrl: string | null;
  blocked: boolean;
  plan: GuildPlan;
};
type Block = { id: string; kind: 'USER' | 'GUILD'; subjectId: string; reason: string | null; createdAt: string };
type Audit = { id: string; username: string; action: string; subjectType: string | null; subjectId: string | null; createdAt: string };
type Config = { contactEmail: string | null; contactDiscord: string | null; contactUrl: string | null };
type StatusChannel = { guildId: string; channelId: string; updatedAt: string } | null;
type Skus = Partial<Record<PaidTier, Partial<Record<StorePeriod, string>>>>;
type DiscordOverview = DiscordStore & {
  skus: Skus;
  applicationId: string;
  lastSync: { at: string; ok: boolean; entitlements: number; changed: number; error?: string } | null;
};
type Overview = {
  guilds: Guild[];
  blocks: Block[];
  audit: Audit[];
  config: Config;
  statusChannel: StatusChannel;
  planCatalog: Plan[];
  discord: DiscordOverview;
};
type Tab = 'servers' | 'monitor' | 'logs' | 'contacts' | 'discord' | 'status' | 'blacklist' | 'audit';

const copy = {
  it: {
    kicker: 'SUPER CONSOLE',
    title: 'Controllo globale di Sentinel.',
    intro: 'Area riservata al proprietario dell’istanza. Le azioni qui sotto hanno effetto su tutti i server collegati al bot.',
    dashboard: 'Dashboard',
    pricing: 'Prezzi',
    tabs: { servers: 'Server e piani', monitor: 'Monitoraggio', logs: 'Log', contacts: 'Contatti', discord: 'Abbonamenti Discord', status: 'Notifiche', blacklist: 'Blacklist', audit: 'Audit' },
    liveServers: 'Server collegati',
    liveServersText: 'Elenco live dalla sessione Discord del bot. Da qui assegni il piano di ogni server.',
    members: 'membri',
    owner: 'Proprietario',
    leave: 'Fai uscire',
    blockLeave: 'Blocca ed espelli',
    managePlan: 'Gestisci piano',
    close: 'Chiudi',
    paid: 'A pagamento',
    freeServers: 'Server Free',
    noServers: 'Sentinel non è collegato ad alcun server.',
    plan: {
      tier: 'Piano',
      manual: 'Da qui assegni solo piani gratuiti (prova, partner, omaggio): i piani a pagamento si vendono solo tramite Discord. Un abbonamento Discord attivo di livello uguale o superiore prende il posto del piano manuale.',
      discordSource: 'Abbonamento Discord',
      expires: 'Scadenza',
      noExpiry: 'Nessuna scadenza',
      plusMonth: '+1 mese',
      plusYear: '+1 anno',
      note: 'Nota interna',
      notePlaceholder: 'Es. prova di 30 giorni per un server partner',
      save: 'Salva piano',
      expiresOn: 'scade il',
      expired: 'scaduto',
      confirmDowngrade: 'Ridurre il piano? I logger non inclusi verranno disattivati e i limiti applicati subito.'
    },
    contacts: {
      title: 'Recapiti pubblici',
      text: 'Mostrati nella pagina prezzi per domande, prove gratuite e collaborazioni.',
      email: 'Email',
      discord: 'Discord (username o link https)',
      url: 'Link: server Discord, sito o modulo (https)',
      save: 'Salva recapiti'
    },
    monitor: {
      title: 'Stato e allarmi',
      text: 'L’API controlla il bot ogni 30 secondi. Se non risponde per circa due minuti invia un allarme al webhook qui sotto, e un altro quando torna attivo. Gli avvisi passano da un webhook perché devono arrivare proprio quando il bot è fermo.',
      bot: 'Bot',
      up: 'Connesso',
      down: 'Non raggiungibile',
      unknown: 'In verifica',
      since: 'dal',
      lastCheck: 'ultimo controllo',
      servers: 'server',
      webhook: 'Webhook Discord per gli allarmi',
      webhookHelp: 'In un canale privato: Modifica canale → Integrazioni → Webhook → Nuovo webhook → Copia URL.',
      webhookSet: 'Webhook configurato',
      webhookNotSet: 'Nessun webhook: gli allarmi restano solo nel registro eventi.',
      save: 'Salva webhook',
      remove: 'Rimuovi',
      test: 'Invia prova',
      testOk: 'Messaggio di prova inviato.',
      events: 'Eventi dell’istanza',
      eventsText: 'Avvio e errori del bot, server aggiunti, rimossi o rifiutati, quote raggiunte, bot giù e ripristinato. Conservati 90 giorni.',
      noEvents: 'Nessun evento registrato.',
      refresh: 'Aggiorna'
    },
    logs: {
      title: 'Log recenti',
      text: 'Le ultime righe di log di bot e API dall’ultimo riavvio, già ripulite da token e segreti. Restano solo in memoria; i file di Docker sono limitati a 50 MB per servizio.',
      service: 'Servizio',
      level: 'Livello minimo',
      empty: 'Nessuna riga per questo filtro.',
      refresh: 'Aggiorna',
      auto: 'Aggiornamento automatico'
    },
    discord: {
      title: 'Abbonamenti Discord',
      text: 'I piani a pagamento si vendono solo come abbonamenti per server tramite le App premium di Discord, agli stessi prezzi della pagina prezzi. Crea gli SKU nel Portale sviluppatori (Monetizzazione) e incolla qui i loro ID: i piani dei server si aggiornano da soli ogni due minuti.',
      monthly: 'SKU mensile',
      yearly: 'SKU annuale (solo se Discord lo prevede)',
      price: 'Prezzo da impostare su Discord',
      save: 'Salva SKU',
      sync: 'Sincronizza ora',
      store: 'Apri lo store',
      notConfigured: 'Nessuno SKU configurato: la pagina prezzi mostra «Presto su Discord».',
      lastSync: 'Ultima sincronizzazione',
      never: 'non ancora eseguita',
      entitlements: 'abbonamenti attivi',
      changed: 'piani aggiornati',
      failed: 'non riuscita: il bot non ha potuto leggere gli abbonamenti'
    },
    status: {
      title: 'Canale notifiche di stato',
      text: 'Il bot invia qui avvio, errori, warning, quote raggiunte e server aggiunti, rimossi o rifiutati. Non sono più visibili nei singoli server.',
      guild: 'Server',
      channel: 'Canale',
      choose: 'Scegli…',
      save: 'Salva canale',
      test: 'Invia messaggio di prova',
      remove: 'Disattiva notifiche',
      current: 'Configurazione attuale',
      notSet: 'Nessun canale configurato: le notifiche di stato non vengono inviate.',
      testOk: 'Messaggio di prova inviato.',
      testFailed: 'Invio non riuscito'
    },
    blacklist: 'Blacklist installazioni',
    blacklistText: 'Blocca preventivamente un server o un utente Discord. I server bloccati vengono espulsi anche se il bot viene aggiunto nuovamente.',
    userId: 'Discord User ID',
    guildId: 'Discord Server ID',
    reason: 'Motivo opzionale',
    blockUser: 'Blocca utente',
    blockGuild: 'Blocca server',
    blocked: 'Bloccato',
    noBlocks: 'Nessun elemento in blacklist.',
    unblock: 'Sblocca',
    audit: 'Audit super-admin',
    auditText: 'Ultime azioni eseguite dalla super console e dal sistema (es. piani scaduti).',
    noAudit: 'Nessuna azione registrata.',
    loading: 'Caricamento super console…',
    denied: 'Accesso negato. Questa area è disponibile solo al super-admin configurato.',
    failed: 'Operazione non riuscita',
    saved: 'Salvato.',
    confirmLeave: 'Vuoi davvero far uscire Sentinel da questo server?',
    confirmBlock: 'Bloccare questo server e far uscire Sentinel?',
    confirmUnblock: 'Rimuovere questo elemento dalla blacklist?',
    invalidId: 'Inserisci un Discord ID valido (17-20 cifre).',
    user: 'Utente',
    guild: 'Server',
    errors: {
      INVALID_SKU: 'ID SKU non valido (17-20 cifre).',
      INVALID_WEBHOOK: 'URL del webhook non valido: copialo da Integrazioni → Webhook.',
      WEBHOOK_NOT_SET: 'Nessun webhook configurato.',
      WEBHOOK_FAILED: 'Discord ha rifiutato il messaggio: controlla che il webhook esista ancora.',
      DUPLICATE_SKU: 'Lo stesso SKU non può valere per due piani.',
      DISCORD_SYNC_FAILED: 'Sincronizzazione non riuscita: il bot non ha potuto leggere gli abbonamenti.',
      EXPIRY_IN_PAST: 'La scadenza è nel passato.',
      UNKNOWN_GUILD_REFERENCE: 'Il canale non appartiene al server scelto o non può ricevere messaggi.',
      DISCORD_RESOURCES_FAILED: 'Impossibile leggere i canali da Discord.',
      STATUS_CHANNEL_NOT_SET: 'Nessun canale configurato.',
      BOT_UNAVAILABLE: 'Il bot non risponde.'
    } as Record<string, string>
  },
  en: {
    kicker: 'SUPER CONSOLE',
    title: 'Global Sentinel control.',
    intro: 'Instance-owner area. Actions here affect every server connected to the bot.',
    dashboard: 'Dashboard',
    pricing: 'Pricing',
    tabs: { servers: 'Servers & plans', monitor: 'Monitoring', logs: 'Logs', contacts: 'Contacts', discord: 'Discord subscriptions', status: 'Notifications', blacklist: 'Blacklist', audit: 'Audit' },
    liveServers: 'Connected servers',
    liveServersText: 'Live list from the bot Discord session. Assign each server’s plan from here.',
    members: 'members',
    owner: 'Owner',
    leave: 'Leave server',
    blockLeave: 'Block & leave',
    managePlan: 'Manage plan',
    close: 'Close',
    paid: 'Paid',
    freeServers: 'Free servers',
    noServers: 'Sentinel is not connected to any server.',
    plan: {
      tier: 'Plan',
      manual: 'Only free plans are assigned here (trial, partner, gift): paid plans are sold only through Discord. An active Discord subscription of the same or a higher level replaces the manual plan.',
      discordSource: 'Discord subscription',
      expires: 'Expiry',
      noExpiry: 'No expiry',
      plusMonth: '+1 month',
      plusYear: '+1 year',
      note: 'Internal note',
      notePlaceholder: 'E.g. 30-day trial for a partner server',
      save: 'Save plan',
      expiresOn: 'expires',
      expired: 'expired',
      confirmDowngrade: 'Lower the plan? Loggers outside it will be switched off and limits applied immediately.'
    },
    contacts: {
      title: 'Public contacts',
      text: 'Shown on the pricing page for questions, free trials and partnerships.',
      email: 'Email',
      discord: 'Discord (username or https link)',
      url: 'Link: Discord server, website or form (https)',
      save: 'Save contacts'
    },
    monitor: {
      title: 'Status and alarms',
      text: 'The API checks the bot every 30 seconds. If it does not answer for about two minutes, an alarm is posted to the webhook below, and another one when it is back. Alarms use a webhook because they must arrive precisely when the bot is not running.',
      bot: 'Bot',
      up: 'Connected',
      down: 'Unreachable',
      unknown: 'Checking',
      since: 'since',
      lastCheck: 'last check',
      servers: 'servers',
      webhook: 'Discord webhook for alarms',
      webhookHelp: 'In a private channel: Edit channel → Integrations → Webhooks → New webhook → Copy URL.',
      webhookSet: 'Webhook configured',
      webhookNotSet: 'No webhook: alarms are only kept in the event log.',
      save: 'Save webhook',
      remove: 'Remove',
      test: 'Send test',
      testOk: 'Test message sent.',
      events: 'Instance events',
      eventsText: 'Bot startup and errors, servers added, removed or rejected, quotas reached, bot down and restored. Kept for 90 days.',
      noEvents: 'No events recorded.',
      refresh: 'Refresh'
    },
    logs: {
      title: 'Recent logs',
      text: 'The latest log lines of the bot and the API since their last restart, with tokens and secrets redacted. They stay in memory only; Docker log files are capped at 50 MB per service.',
      service: 'Service',
      level: 'Minimum level',
      empty: 'No lines for this filter.',
      refresh: 'Refresh',
      auto: 'Auto refresh'
    },
    discord: {
      title: 'Discord subscriptions',
      text: 'Paid plans are sold only as per-server subscriptions through Discord Premium Apps, at the same prices as the pricing page. Create the SKUs in the Developer Portal (Monetization) and paste their IDs here: server plans update by themselves every two minutes.',
      monthly: 'Monthly SKU',
      yearly: 'Yearly SKU (only if Discord offers it)',
      price: 'Price to set on Discord',
      save: 'Save SKUs',
      sync: 'Sync now',
      store: 'Open the store',
      notConfigured: 'No SKU configured: the pricing page shows “Coming soon on Discord”.',
      lastSync: 'Last sync',
      never: 'not run yet',
      entitlements: 'active subscriptions',
      changed: 'plans updated',
      failed: 'failed: the bot could not read the subscriptions'
    },
    status: {
      title: 'Status notification channel',
      text: 'The bot posts startup, errors, warnings, reached quotas and servers added, removed or rejected here. They are no longer visible in individual servers.',
      guild: 'Server',
      channel: 'Channel',
      choose: 'Choose…',
      save: 'Save channel',
      test: 'Send a test message',
      remove: 'Turn off notifications',
      current: 'Current configuration',
      notSet: 'No channel configured: status notifications are not sent.',
      testOk: 'Test message sent.',
      testFailed: 'Delivery failed'
    },
    blacklist: 'Installation blacklist',
    blacklistText: 'Preemptively block a Discord server or user. Blocked servers are removed even if the bot is added again.',
    userId: 'Discord User ID',
    guildId: 'Discord Server ID',
    reason: 'Optional reason',
    blockUser: 'Block user',
    blockGuild: 'Block server',
    blocked: 'Blocked',
    noBlocks: 'Nothing is blacklisted.',
    unblock: 'Unblock',
    audit: 'Super-admin audit',
    auditText: 'Latest actions from the super console and the system (e.g. expired plans).',
    noAudit: 'No actions recorded.',
    loading: 'Loading super console…',
    denied: 'Access denied. This area is available only to the configured super-admin.',
    failed: 'Operation failed',
    saved: 'Saved.',
    confirmLeave: 'Do you really want Sentinel to leave this server?',
    confirmBlock: 'Block this server and make Sentinel leave it?',
    confirmUnblock: 'Remove this item from the blacklist?',
    invalidId: 'Enter a valid Discord ID (17-20 digits).',
    user: 'User',
    guild: 'Server',
    errors: {
      INVALID_SKU: 'Invalid SKU ID (17-20 digits).',
      INVALID_WEBHOOK: 'Invalid webhook URL: copy it from Integrations → Webhooks.',
      WEBHOOK_NOT_SET: 'No webhook configured.',
      WEBHOOK_FAILED: 'Discord rejected the message: check that the webhook still exists.',
      DUPLICATE_SKU: 'The same SKU cannot be used for two plans.',
      DISCORD_SYNC_FAILED: 'Sync failed: the bot could not read the subscriptions.',
      EXPIRY_IN_PAST: 'The expiry date is in the past.',
      UNKNOWN_GUILD_REFERENCE: 'The channel does not belong to the selected server or cannot receive messages.',
      DISCORD_RESOURCES_FAILED: 'Unable to read channels from Discord.',
      STATUS_CHANNEL_NOT_SET: 'No channel configured.',
      BOT_UNAVAILABLE: 'The bot is not responding.'
    } as Record<string, string>
  }
} as const;

type Copy = (typeof copy)[Locale];

const snowflake = /^\d{17,20}$/;

class ActionError extends Error {}

export default function SuperConsole({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>('servers');

  const load = useCallback(async () => {
    const response = await fetch('/backend/api/super/overview');
    if (response.status === 401 || response.status === 403) {
      setError(c.denied);
      return;
    }
    if (!response.ok) throw new Error('LOAD_FAILED');
    setData(await response.json());
    setError('');
  }, [c.denied]);

  useEffect(() => {
    load().catch(() => setError(c.failed));
  }, [load, c.failed]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), status.kind === 'error' ? 6000 : 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  /** Runs a request, reloads the overview and reports the outcome. */
  const action = useCallback(async (url: string, init: RequestInit, options: { reload?: boolean; quiet?: boolean } = {}) => {
    setStatus(null);
    const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof body.error === 'string' ? body.error : `HTTP_${response.status}`;
      const text = c.errors[code] ?? `${c.failed} (${code})`;
      setStatus({ kind: 'error', text });
      throw new ActionError(text);
    }
    if (options.reload !== false) await load();
    if (!options.quiet) setStatus({ kind: 'ok', text: c.saved });
    return body;
  }, [c, load]);

  const fmt = useCallback((value: string) => new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', {
    dateStyle: 'short', timeStyle: 'short'
  }).format(new Date(value)), [locale]);

  const tabs: Array<{ key: Tab; icon: IconName; label: string; badge?: number }> = [
    { key: 'servers', icon: 'grid', label: c.tabs.servers },
    { key: 'monitor', icon: 'globe', label: c.tabs.monitor },
    { key: 'logs', icon: 'code', label: c.tabs.logs },
    { key: 'contacts', icon: 'users', label: c.tabs.contacts },
    { key: 'discord', icon: 'key', label: c.tabs.discord },
    { key: 'status', icon: 'bolt', label: c.tabs.status },
    { key: 'blacklist', icon: 'lock', label: c.tabs.blacklist },
    { key: 'audit', icon: 'clock', label: c.tabs.audit }
  ];

  return (
    <main className="public-site super-console" lang={locale}>
      <SiteHeader
        locale={locale}
        itHref="/it/super"
        enHref="/en/super"
        links={[{ href: `/${locale}/dashboard`, label: c.dashboard }, { href: `/${locale}/pricing`, label: c.pricing }]}
      />

      <section className="page">
        <div className="site-container">
          <div className="page-head">
            <div>
              <span className="kicker kicker-danger">{c.kicker}</span>
              <h1>{c.title}</h1>
              <p>{c.intro}</p>
            </div>
          </div>

          {status && <div className={`toast ${status.kind === 'error' ? 'toast-error' : ''}`} role="status" onClick={() => setStatus(null)}>{status.text}</div>}
          {error && <div className="notice notice-error">{error}</div>}
          {!data && !error && <div className="card">{c.loading}</div>}

          {data && <>
            <div className="metric-row">
              <div className="metric"><span>{c.liveServers}</span><strong>{data.guilds.length}</strong></div>
              <div className="metric"><span>{c.paid}</span><strong>{data.guilds.filter((guild) => guild.plan && guild.plan.planTier !== 'FREE').length}</strong></div>
              <div className="metric"><span>{c.freeServers}</span><strong>{data.guilds.filter((guild) => !guild.plan || guild.plan.planTier === 'FREE').length}</strong></div>
              <div className="metric"><span>{c.tabs.discord}</span><strong>{data.guilds.filter((guild) => guild.plan?.planSource === 'DISCORD').length}</strong></div>
            </div>

            <nav className="console-tabs" aria-label={c.kicker}>
              {tabs.map((item) => (
                <button key={item.key} className={tab === item.key ? 'active' : ''} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>
                  <Icon name={item.icon} size={15} />{item.label}{item.badge ? <span className="console-badge">{item.badge}</span> : null}
                </button>
              ))}
            </nav>

            {tab === 'servers' && <ServersTab data={data} c={c} locale={locale} action={action} fmt={fmt} />}
            {tab === 'monitor' && <MonitorTab c={c} action={action} fmt={fmt} setStatus={setStatus} />}
            {tab === 'logs' && <LogsTab c={c} fmt={fmt} />}
            {tab === 'contacts' && <ContactsTab data={data} c={c} action={action} />}
            {tab === 'discord' && <DiscordTab data={data} c={c} locale={locale} action={action} fmt={fmt} />}
            {tab === 'status' && <StatusTab data={data} c={c} action={action} fmt={fmt} setStatus={setStatus} />}
            {tab === 'blacklist' && <BlacklistTab data={data} c={c} action={action} fmt={fmt} setStatus={setStatus} />}
            {tab === 'audit' && (
              <section className="card">
                <div className="card-head"><div><span className="kicker">Audit</span><h2>{c.audit}</h2><p>{c.auditText}</p></div></div>
                {!data.audit.length && <div className="empty">{c.noAudit}</div>}
                <div className="log-table">
                  {data.audit.map((item) => (
                    <div className="log-row" key={item.id}>
                      <strong className="mono">{item.action}</strong>
                      <span>{item.subjectType ? <>{item.subjectType} · <span className="mono">{item.subjectId}</span></> : '—'}</span>
                      <span>{item.username}</span>
                      <time className="mono">{fmt(item.createdAt)}</time>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>}
        </div>
      </section>
    </main>
  );
}

type Action = (url: string, init: RequestInit, options?: { reload?: boolean; quiet?: boolean }) => Promise<Record<string, unknown>>;
type SetStatus = (value: { kind: 'ok' | 'error'; text: string } | null) => void;
type TabProps = { data: Overview; c: Copy; locale: Locale; action: Action; fmt: (value: string) => string };
const ignore = () => undefined;

/* ------------------------------------------------------------------ servers */

function ServersTab({ data, c, locale, action }: TabProps) {
  const [editing, setEditing] = useState<string | null>(null);

  const leave = (guild: Guild) => {
    if (confirm(c.confirmLeave)) action(`/backend/api/super/guilds/${guild.id}/leave`, { method: 'POST', body: '{}' }).catch(ignore);
  };
  const blockGuild = (guild: Guild) => {
    if (confirm(c.confirmBlock)) {
      action(`/backend/api/super/blocks/GUILD/${guild.id}`, { method: 'PUT', body: JSON.stringify({ reason: 'Blocked from super console server list' }) }).catch(ignore);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <div><span className="kicker">Discord</span><h2>{c.liveServers}</h2><p>{c.liveServersText}</p></div>
      </div>
      {!data.guilds.length && <div className="empty">{c.noServers}</div>}
      <div className="table-list">
        {data.guilds.map((guild) => {
          const tier = guild.plan?.planTier ?? 'FREE';
          const expires = guild.plan?.planExpiresAt ? new Date(guild.plan.planExpiresAt) : null;
          const expired = Boolean(expires && expires.getTime() < Date.now());
          return (
            <article className="super-guild-block" key={guild.id}>
              <div className="super-guild">
                <div className="super-guild-identity">
                  {guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : <div className="guild-placeholder">{guild.name.slice(0, 1)}</div>}
                  <div><strong>{guild.name}</strong><span className="mono">{guild.id}</span></div>
                </div>
                <div className="super-guild-meta">
                  <span>{c.owner}: {guild.ownerTag || guild.ownerId}</span>
                  <span>{guild.memberCount.toLocaleString(locale === 'it' ? 'it-IT' : 'en-US')} {c.members}</span>
                </div>
                <div className="super-guild-plan">
                  <span className={`tag ${tier !== 'FREE' && !expired ? 'tag-premium' : ''}`}>{tierLabel(tier, locale)}</span>
                  {guild.plan?.planSource === 'DISCORD' && <small>{c.plan.discordSource}</small>}
                  {expires && <small className={expired ? 'text-danger' : ''}>{expired ? c.plan.expired : c.plan.expiresOn} {expires.toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB')}</small>}
                </div>
                <div className="super-guild-actions">
                  <button className="button button-sm button-premium" onClick={() => setEditing(editing === guild.id ? null : guild.id)}>{editing === guild.id ? c.close : c.managePlan}</button>
                  <button className="button button-sm button-secondary" onClick={() => leave(guild)}>{c.leave}</button>
                  <button className="button button-sm button-danger" onClick={() => blockGuild(guild)}>{c.blockLeave}</button>
                </div>
              </div>
              {editing === guild.id && <PlanEditor guild={guild} c={c} locale={locale} action={action} onDone={() => setEditing(null)} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}

const toDateInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 10) : '';

function PlanEditor({ guild, c, locale, action, onDone }: { guild: Guild; c: Copy; locale: Locale; action: Action; onDone: () => void }) {
  const [tier, setTier] = useState<PlanTier>(guild.plan?.planTier ?? 'FREE');
  const [expires, setExpires] = useState(toDateInput(guild.plan?.planExpiresAt ?? null));
  const [note, setNote] = useState(guild.plan?.planNote ?? '');
  const free = tier === 'FREE';

  const extend = (months: number) => {
    const start = expires && new Date(expires).getTime() > Date.now() ? new Date(expires) : new Date();
    start.setMonth(start.getMonth() + months);
    setExpires(start.toISOString().slice(0, 10));
  };

  const save = () => {
    const current = guild.plan?.planTier ?? 'FREE';
    if (TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(current) && !confirm(c.plan.confirmDowngrade)) return;
    action(`/backend/api/super/guilds/${guild.id}/plan`, {
      method: 'PUT',
      body: JSON.stringify({
        tier,
        // End of the chosen day, in the browser's time zone.
        expiresAt: free || !expires ? null : new Date(`${expires}T23:59:59`).toISOString(),
        note: note.trim() || null
      })
    }).then(onDone, ignore);
  };

  return (
    <div className="plan-editor">
      <p className="muted">{c.plan.manual}</p>
      <div className="inline-fields">
        <label>{c.plan.tier}<select value={tier} onChange={(e) => setTier(e.target.value as PlanTier)}>
          {TIER_ORDER.map((item) => <option key={item} value={item}>{tierLabel(item, locale)}</option>)}
        </select></label>
        <label>{c.plan.expires}<input disabled={free} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
      </div>
      {!free && <div className="plan-editor-quick">
        <button type="button" className="button button-sm button-ghost" onClick={() => extend(1)}>{c.plan.plusMonth}</button>
        <button type="button" className="button button-sm button-ghost" onClick={() => extend(12)}>{c.plan.plusYear}</button>
        <button type="button" className="button button-sm button-ghost" onClick={() => setExpires('')}>{c.plan.noExpiry}</button>
      </div>}
      <label>{c.plan.note}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={c.plan.notePlaceholder} /></label>
      <button className="button button-primary" onClick={save}>{c.plan.save}</button>
    </div>
  );
}

/* ------------------------------------------------------------------ monitor */

type MonitorEvent = { id: string; source: string; level: string; title: string; description: string | null; fields: Array<{ name: string; value: string }>; createdAt: string };
type Monitor = {
  bot: { status: 'unknown' | 'up' | 'down'; since: string; lastCheck: string | null; guilds: number | null };
  events: MonitorEvent[];
  webhook: { configured: boolean; hint: string | null };
};

function MonitorTab({ c, action, fmt, setStatus }: { c: Copy; action: Action; fmt: (value: string) => string; setStatus: SetStatus }) {
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [url, setUrl] = useState('');
  const load = useCallback(() => fetch('/backend/api/super/monitor').then((response) => response.ok ? response.json() : null).then((value) => { if (value) setMonitor(value); }).catch(() => null), []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const saveWebhook = (value: string | null) => action('/backend/api/super/alert-webhook', { method: 'PUT', body: JSON.stringify({ url: value }) }, { reload: false })
    .then(() => { setUrl(''); void load(); }, ignore);
  const test = () => action('/backend/api/super/alert-webhook/test', { method: 'POST', body: '{}' }, { reload: false, quiet: true })
    .then(() => setStatus({ kind: 'ok', text: c.monitor.testOk }), ignore);

  const bot = monitor?.bot;
  const label = bot ? { up: c.monitor.up, down: c.monitor.down, unknown: c.monitor.unknown }[bot.status] : c.monitor.unknown;

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div><span className="kicker">{c.tabs.monitor}</span><h2>{c.monitor.title}</h2><p>{c.monitor.text}</p></div>
          <button className="button button-sm button-secondary" onClick={() => void load()}>{c.monitor.refresh}</button>
        </div>
        <div className="monitor-status">
          <span className={`status-dot status-${bot?.status ?? 'unknown'}`} aria-hidden="true" />
          <strong>{c.monitor.bot}: {label}</strong>
          {bot && <span>{c.monitor.since} {fmt(bot.since)}{bot.lastCheck ? ` · ${c.monitor.lastCheck} ${fmt(bot.lastCheck)}` : ''}{bot.guilds !== null && bot.status === 'up' ? ` · ${bot.guilds} ${c.monitor.servers}` : ''}</span>}
        </div>
        <label>{c.monitor.webhook}
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={monitor?.webhook.configured ? `${c.monitor.webhookSet} (${monitor.webhook.hint})` : 'https://discord.com/api/webhooks/…'} />
          <small className="field-help">{c.monitor.webhookHelp}</small>
        </label>
        {!monitor?.webhook.configured && <p className="muted">{c.monitor.webhookNotSet}</p>}
        <div className="guide-actions">
          <button className="button button-primary" disabled={!url.trim()} onClick={() => saveWebhook(url.trim())}>{c.monitor.save}</button>
          {monitor?.webhook.configured && <button className="button button-secondary" onClick={test}>{c.monitor.test}</button>}
          {monitor?.webhook.configured && <button className="button button-danger" onClick={() => saveWebhook(null)}>{c.monitor.remove}</button>}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><div><span className="kicker">{c.tabs.monitor}</span><h2>{c.monitor.events}</h2><p>{c.monitor.eventsText}</p></div></div>
        {monitor && !monitor.events.length && <div className="empty">{c.monitor.noEvents}</div>}
        <div className="log-table">
          {monitor?.events.map((event) => (
            <div className="log-row event-row" key={event.id}>
              <span className={`level-badge level-${event.level}`}>{event.level}</span>
              <div>
                <strong>{event.title}</strong>
                {event.description && <span>{event.description}</span>}
                {event.fields.map((field) => <span key={field.name} className="event-field"><b>{field.name}:</b> {field.value}</span>)}
              </div>
              <span className="mono">{event.source}</span>
              <time className="mono">{fmt(event.createdAt)}</time>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* --------------------------------------------------------------------- logs */

type LogLine = { time: string; level: string; msg: string; context: Record<string, unknown> | null };

function LogsTab({ c, fmt }: { c: Copy; fmt: (value: string) => string }) {
  const [service, setService] = useState<'bot' | 'api'>('bot');
  const [level, setLevel] = useState('info');
  const [auto, setAuto] = useState(false);
  const [lines, setLines] = useState<LogLine[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    const query = new URLSearchParams({ service, level, limit: '300' });
    return fetch(`/backend/api/super/logs?${query}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((value: { entries: LogLine[] }) => { setLines(value.entries); setFailed(false); })
      .catch(() => setFailed(true));
  }, [service, level]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [auto, load]);

  return (
    <section className="card">
      <div className="card-head"><div><span className="kicker">{c.tabs.logs}</span><h2>{c.logs.title}</h2><p>{c.logs.text}</p></div></div>
      <div className="inline-fields">
        <label>{c.logs.service}<select value={service} onChange={(e) => setService(e.target.value as 'bot' | 'api')}><option value="bot">Bot</option><option value="api">API</option></select></label>
        <label>{c.logs.level}<select value={level} onChange={(e) => setLevel(e.target.value)}>{['debug', 'info', 'warn', 'error'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />{c.logs.auto}</label>
        <button className="button button-sm button-secondary" onClick={() => void load()}>{c.logs.refresh}</button>
      </div>
      {failed && <div className="notice notice-error">{c.errors.BOT_UNAVAILABLE}</div>}
      {lines && !lines.length && <div className="empty">{c.logs.empty}</div>}
      <div className="log-lines">
        {lines?.map((line, index) => (
          <details className={`log-line level-${line.level}`} key={`${line.time}-${index}`}>
            <summary><time className="mono">{fmt(line.time)}</time><span className={`level-badge level-${line.level}`}>{line.level}</span><span className="log-msg">{line.msg || '—'}</span></summary>
            {line.context && <pre>{JSON.stringify(line.context, null, 2)}</pre>}
          </details>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- contacts */

function ContactsTab({ data, c, action }: Pick<TabProps, 'data' | 'c' | 'action'>) {
  const [email, setEmail] = useState(data.config.contactEmail ?? '');
  const [discord, setDiscord] = useState(data.config.contactDiscord ?? '');
  const [url, setUrl] = useState(data.config.contactUrl ?? '');
  const save = () => action('/backend/api/super/config', {
    method: 'PUT',
    body: JSON.stringify({ contactEmail: email.trim() || null, contactDiscord: discord.trim() || null, contactUrl: url.trim() || null })
  }).catch(ignore);

  return (
    <section className="card">
      <div className="card-head"><div><span className="kicker">{c.tabs.contacts}</span><h2>{c.contacts.title}</h2><p>{c.contacts.text}</p></div></div>
      <div className="inline-fields">
        <label>{c.contacts.email}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} /></label>
        <label>{c.contacts.discord}<input value={discord} onChange={(e) => setDiscord(e.target.value)} maxLength={200} /></label>
        <label>{c.contacts.url}<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://" /></label>
      </div>
      <button className="button button-primary" onClick={save}>{c.contacts.save}</button>
    </section>
  );
}

/* ------------------------------------------------------------------ discord */

const PAID_TIERS: PaidTier[] = ['TIER1', 'TIER2', 'TIER3'];
const STORE_PERIODS: StorePeriod[] = ['MONTHLY', 'YEARLY'];

function DiscordTab({ data, c, locale, action, fmt }: TabProps) {
  const discord = data.discord;
  const [skus, setSkus] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {};
    for (const tier of PAID_TIERS) for (const period of STORE_PERIODS) values[`${tier}.${period}`] = discord.skus[tier]?.[period] ?? '';
    return values;
  });

  const save = () => {
    const body: Record<string, Record<string, string | null>> = {};
    for (const tier of PAID_TIERS) {
      body[tier] = {};
      for (const period of STORE_PERIODS) body[tier]![period] = skus[`${tier}.${period}`]!.trim() || null;
    }
    action('/backend/api/super/discord-skus', { method: 'PUT', body: JSON.stringify(body) }).catch(ignore);
  };
  const sync = () => action('/backend/api/super/discord-sync', { method: 'POST', body: '{}' }).catch(ignore);
  const last = discord.lastSync;

  return (
    <section className="card">
      <div className="card-head">
        <div><span className="kicker">Discord</span><h2>{c.discord.title}</h2><p>{c.discord.text}</p></div>
        {discord.enabled && <a className="button button-sm button-secondary" href={discord.store} target="_blank" rel="noopener noreferrer">{c.discord.store}</a>}
      </div>
      {!discord.enabled && <div className="notice premium-notice">{c.discord.notConfigured}</div>}
      <div className="sku-form">
        {PAID_TIERS.map((tier) => {
          const plan = data.planCatalog.find((item) => item.tier === tier);
          return STORE_PERIODS.map((period) => (
            <label key={`${tier}.${period}`}>
              {tierLabel(tier, locale)} · {period === 'MONTHLY' ? c.discord.monthly : c.discord.yearly}
              <input
                className="mono"
                value={skus[`${tier}.${period}`]}
                onChange={(e) => setSkus((current) => ({ ...current, [`${tier}.${period}`]: e.target.value.replace(/\D/g, '') }))}
                inputMode="numeric"
                maxLength={20}
                placeholder="SKU ID"
              />
              {plan && <small className="field-help">{c.discord.price}: {formatPrice(period === 'MONTHLY' ? plan.monthlyCents : plan.yearlyCents, locale)}</small>}
            </label>
          ));
        })}
        <button className="button button-primary" onClick={save}>{c.discord.save}</button>
      </div>
      <div className="inline-fields">
        <p className="muted">
          {c.discord.lastSync}: {last
            ? last.ok
              ? `${fmt(last.at)} · ${last.entitlements} ${c.discord.entitlements} · ${last.changed} ${c.discord.changed}`
              : `${fmt(last.at)} · ${c.discord.failed}`
            : c.discord.never}
        </p>
        <button className="button button-sm button-secondary" disabled={!discord.enabled} onClick={sync}>{c.discord.sync}</button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- status */

function StatusTab({ data, c, action, fmt, setStatus }: Omit<TabProps, 'locale'> & { setStatus: SetStatus }) {
  const [guildId, setGuildId] = useState(data.statusChannel?.guildId ?? '');
  const [channelId, setChannelId] = useState(data.statusChannel?.channelId ?? '');
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!guildId) { setChannels([]); return; }
    let cancelled = false;
    fetch(`/backend/api/super/status-channel/channels?guildId=${guildId}`)
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => { if (!cancelled) setChannels(rows); })
      .catch(() => { if (!cancelled) setChannels([]); });
    return () => { cancelled = true; };
  }, [guildId]);

  const currentGuild = data.guilds.find((guild) => guild.id === data.statusChannel?.guildId);
  const currentChannel = data.statusChannel && guildId === data.statusChannel.guildId
    ? channels.find((channel) => channel.id === data.statusChannel?.channelId)?.name
    : undefined;
  const save = () => action('/backend/api/super/status-channel', { method: 'PUT', body: JSON.stringify({ guildId, channelId }) }).catch(ignore);
  const remove = () => action('/backend/api/super/status-channel', { method: 'DELETE' }).catch(ignore);
  const test = async () => {
    try {
      const result = await action('/backend/api/super/status-channel/test', { method: 'POST', body: '{}' }, { reload: false, quiet: true });
      if (result.ok) setStatus({ kind: 'ok', text: c.status.testOk });
      else setStatus({ kind: 'error', text: `${c.status.testFailed}: ${c.errors[String(result.error)] ?? String(result.error)}` });
    } catch { /* already reported by action() */ }
  };

  return (
    <section className="card">
      <div className="card-head"><div><span className="kicker">{c.tabs.status}</span><h2>{c.status.title}</h2><p>{c.status.text}</p></div></div>
      <div className="notice">
        <strong>{c.status.current}: </strong>
        {data.statusChannel
          ? <>{currentGuild?.name ?? data.statusChannel.guildId} · <span className="mono">#{currentChannel ?? data.statusChannel.channelId}</span> · {fmt(data.statusChannel.updatedAt)}</>
          : c.status.notSet}
      </div>
      <div className="inline-fields">
        <label>{c.status.guild}<select value={guildId} onChange={(e) => { setGuildId(e.target.value); setChannelId(''); }}>
          <option value="">{c.status.choose}</option>
          {data.guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
        </select></label>
        <label>{c.status.channel}<select value={channelId} disabled={!guildId} onChange={(e) => setChannelId(e.target.value)}>
          <option value="">{c.status.choose}</option>
          {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
        </select></label>
      </div>
      <div className="button-row">
        <button className="button button-primary" disabled={!guildId || !channelId} onClick={save}>{c.status.save}</button>
        <button className="button button-secondary" disabled={!data.statusChannel} onClick={test}>{c.status.test}</button>
        <button className="button button-danger" disabled={!data.statusChannel} onClick={remove}>{c.status.remove}</button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- blacklist */

function BlacklistTab({ data, c, action, fmt, setStatus }: Omit<TabProps, 'locale'> & { setStatus: SetStatus }) {
  const [userId, setUserId] = useState('');
  const [guildId, setGuildId] = useState('');
  const [userReason, setUserReason] = useState('');
  const [guildReason, setGuildReason] = useState('');

  const block = (kind: 'USER' | 'GUILD', id: string, reason: string) => {
    if (!snowflake.test(id)) {
      setStatus({ kind: 'error', text: c.invalidId });
      return;
    }
    action(`/backend/api/super/blocks/${kind}/${id}`, { method: 'PUT', body: JSON.stringify({ reason: reason.trim() || undefined }) }).then(() => {
      if (kind === 'USER') { setUserId(''); setUserReason(''); }
      else { setGuildId(''); setGuildReason(''); }
    }, ignore);
  };
  const unblock = (item: Block) => {
    if (confirm(c.confirmUnblock)) action(`/backend/api/super/blocks/${item.kind}/${item.subjectId}`, { method: 'DELETE' }).catch(ignore);
  };

  return (
    <section className="card">
      <div className="card-head"><div><span className="kicker">Policy</span><h2>{c.blacklist}</h2><p>{c.blacklistText}</p></div></div>
      <div className="block-forms">
        <div>
          <label>{c.userId}<input value={userId} onChange={(e) => setUserId(e.target.value.trim())} inputMode="numeric" placeholder="123456789012345678" /></label>
          <label>{c.reason}<input value={userReason} onChange={(e) => setUserReason(e.target.value)} maxLength={500} /></label>
          <button className="button button-secondary" onClick={() => block('USER', userId, userReason)}>{c.blockUser}</button>
        </div>
        <div>
          <label>{c.guildId}<input value={guildId} onChange={(e) => setGuildId(e.target.value.trim())} inputMode="numeric" placeholder="123456789012345678" /></label>
          <label>{c.reason}<input value={guildReason} onChange={(e) => setGuildReason(e.target.value)} maxLength={500} /></label>
          <button className="button button-danger" onClick={() => block('GUILD', guildId, guildReason)}>{c.blockGuild}</button>
        </div>
      </div>
      {!data.blocks.length && <div className="empty">{c.noBlocks}</div>}
      <div className="table-list">
        {data.blocks.map((item) => (
          <div className="block-row" key={item.id}>
            <div><strong>{item.kind === 'USER' ? c.user : c.guild} · <span className="mono">{item.subjectId}</span></strong><span>{item.reason || '—'} · {fmt(item.createdAt)}</span></div>
            <span className="tag tag-danger">{c.blocked}</span>
            <button className="button button-sm button-secondary" onClick={() => unblock(item)}>{c.unblock}</button>
          </div>
        ))}
      </div>
    </section>
  );
}
