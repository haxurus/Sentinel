'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from './Brand';
import { SiteHeader } from './SiteChrome';
import type { Locale } from '../i18n';
import { TIER_ORDER, formatPrice, tierLabel, type Plan, type PlanTier } from './plans';

type GuildPlan = {
  planTier: PlanTier;
  planBilling: string | null;
  planExpiresAt: string | null;
  planCouponCode: string | null;
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
type Config = { waitlistOpen: boolean; contactEmail: string | null; contactDiscord: string | null; contactUrl: string | null };
type StatusChannel = { guildId: string; channelId: string; updatedAt: string } | null;
type Coupon = {
  id: string;
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  tiers: string[];
  billing: string;
  maxRedemptions: number | null;
  redemptions: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  public: boolean;
};
type WaitlistEntry = {
  id: string;
  userId: string;
  username: string;
  guildId: string;
  guildName: string | null;
  memberCount: number;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  installed: boolean;
};
type Overview = {
  guilds: Guild[];
  blocks: Block[];
  audit: Audit[];
  config: Config;
  statusChannel: StatusChannel;
  coupons: Coupon[];
  planCatalog: Plan[];
  waitlist: WaitlistEntry[];
};
type Tab = 'servers' | 'beta' | 'coupons' | 'status' | 'blacklist' | 'audit';

const copy = {
  it: {
    kicker: 'SUPER CONSOLE',
    title: 'Controllo globale di Sentinel.',
    intro: 'Area riservata al proprietario dell’istanza. Le azioni qui sotto hanno effetto su tutti i server collegati al bot.',
    dashboard: 'Dashboard',
    pricing: 'Prezzi',
    tabs: { servers: 'Server e piani', beta: 'Beta', coupons: 'Coupon', status: 'Notifiche', blacklist: 'Blacklist', audit: 'Audit' },
    liveServers: 'Server collegati',
    liveServersText: 'Elenco live dalla sessione Discord del bot. Da qui assegni il piano di ogni server.',
    members: 'membri',
    owner: 'Proprietario',
    leave: 'Fai uscire',
    blockLeave: 'Blocca ed espelli',
    managePlan: 'Gestisci piano',
    close: 'Chiudi',
    paid: 'A pagamento',
    pending: 'Richieste in attesa',
    noServers: 'Sentinel non è collegato ad alcun server.',
    plan: {
      tier: 'Piano',
      billing: 'Fatturazione',
      monthly: 'Mensile',
      yearly: 'Annuale',
      gift: 'Omaggio / prova',
      expires: 'Scadenza',
      noExpiry: 'Nessuna scadenza',
      plusMonth: '+1 mese',
      plusYear: '+1 anno',
      coupon: 'Codice coupon',
      note: 'Nota interna',
      notePlaceholder: 'Es. pagato con bonifico il 10/10',
      price: 'Prezzo',
      save: 'Salva piano',
      expiresOn: 'scade il',
      expired: 'scaduto',
      confirmDowngrade: 'Ridurre il piano? I logger non inclusi verranno disattivati e i limiti applicati subito.'
    },
    beta: {
      title: 'Lista d’attesa',
      text: 'Quando è attiva chiunque può iscriversi dalla pagina Beta con il proprio account Discord. Approvare una richiesta autorizza quel server ad aggiungere il bot.',
      open: 'Iscrizioni aperte',
      openText: 'Disattiva per non accettare nuove richieste. Le richieste già inviate restano qui.',
      contacts: 'Recapiti pubblici',
      contactsText: 'Mostrati nella pagina prezzi e nella pagina beta. GitHub è sempre incluso.',
      email: 'Email',
      discord: 'Discord (username o link https)',
      url: 'Sito o modulo (https)',
      saveContacts: 'Salva recapiti',
      filter: { PENDING: 'In attesa', APPROVED: 'Approvate', REJECTED: 'Rifiutate', ALL: 'Tutte' },
      approve: 'Approva',
      reject: 'Rifiuta',
      reset: 'Rimetti in attesa',
      remove: 'Elimina',
      confirmRemove: 'Eliminare definitivamente questa richiesta?',
      installed: 'Bot installato',
      requester: 'Richiesta da',
      none: 'Nessuna richiesta in questo stato.'
    },
    coupons: {
      title: 'Coupon e sconti',
      text: 'I coupon si applicano quando assegni un piano a un server. Quelli pubblici compaiono come promozione nella pagina prezzi.',
      code: 'Codice',
      type: 'Tipo di sconto',
      percent: 'Percentuale',
      amount: 'Importo fisso (€)',
      value: 'Valore',
      tiers: 'Piani',
      allTiers: 'Tutti i piani a pagamento',
      billing: 'Fatturazione',
      any: 'Qualsiasi',
      max: 'Utilizzi massimi',
      from: 'Valido dal',
      until: 'Valido fino al',
      description: 'Descrizione',
      public: 'Mostra nella pagina prezzi',
      create: 'Crea coupon',
      active: 'Attivo',
      used: 'utilizzi',
      unlimited: 'illimitati',
      remove: 'Elimina',
      confirmRemove: 'Eliminare questo coupon?',
      none: 'Nessun coupon.'
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
      COUPON_NOT_FOUND: 'Coupon inesistente.',
      COUPON_INACTIVE: 'Coupon disattivato.',
      COUPON_NOT_STARTED: 'Coupon non ancora valido.',
      COUPON_EXPIRED: 'Coupon scaduto.',
      COUPON_EXHAUSTED: 'Coupon esaurito.',
      COUPON_FREE_PLAN: 'Un coupon non si applica al piano Free.',
      COUPON_WRONG_TIER: 'Il coupon non vale per questo piano.',
      COUPON_WRONG_BILLING: 'Il coupon non vale per questa fatturazione.',
      COUPON_EXISTS: 'Esiste già un coupon con questo codice.',
      INVALID_COUPON: 'Coupon non valido: indica un solo tipo di sconto e un codice di 3-32 caratteri.',
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
    tabs: { servers: 'Servers & plans', beta: 'Beta', coupons: 'Coupons', status: 'Notifications', blacklist: 'Blacklist', audit: 'Audit' },
    liveServers: 'Connected servers',
    liveServersText: 'Live list from the bot Discord session. Assign each server’s plan from here.',
    members: 'members',
    owner: 'Owner',
    leave: 'Leave server',
    blockLeave: 'Block & leave',
    managePlan: 'Manage plan',
    close: 'Close',
    paid: 'Paid',
    pending: 'Pending requests',
    noServers: 'Sentinel is not connected to any server.',
    plan: {
      tier: 'Plan',
      billing: 'Billing',
      monthly: 'Monthly',
      yearly: 'Yearly',
      gift: 'Gift / trial',
      expires: 'Expiry',
      noExpiry: 'No expiry',
      plusMonth: '+1 month',
      plusYear: '+1 year',
      coupon: 'Coupon code',
      note: 'Internal note',
      notePlaceholder: 'E.g. paid by bank transfer on 10/10',
      price: 'Price',
      save: 'Save plan',
      expiresOn: 'expires',
      expired: 'expired',
      confirmDowngrade: 'Lower the plan? Loggers outside it will be switched off and limits applied immediately.'
    },
    beta: {
      title: 'Waitlist',
      text: 'When open, anyone can sign up from the Beta page with their Discord account. Approving a request authorises that server to add the bot.',
      open: 'Sign-ups open',
      openText: 'Turn off to stop accepting new requests. Existing requests stay here.',
      contacts: 'Public contacts',
      contactsText: 'Shown on the pricing and beta pages. GitHub is always included.',
      email: 'Email',
      discord: 'Discord (username or https link)',
      url: 'Website or form (https)',
      saveContacts: 'Save contacts',
      filter: { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', ALL: 'All' },
      approve: 'Approve',
      reject: 'Reject',
      reset: 'Back to pending',
      remove: 'Delete',
      confirmRemove: 'Permanently delete this request?',
      installed: 'Bot installed',
      requester: 'Requested by',
      none: 'No requests in this state.'
    },
    coupons: {
      title: 'Coupons & discounts',
      text: 'Coupons apply when you assign a plan to a server. Public ones appear as promotions on the pricing page.',
      code: 'Code',
      type: 'Discount type',
      percent: 'Percentage',
      amount: 'Fixed amount (€)',
      value: 'Value',
      tiers: 'Plans',
      allTiers: 'Every paid plan',
      billing: 'Billing',
      any: 'Any',
      max: 'Maximum redemptions',
      from: 'Valid from',
      until: 'Valid until',
      description: 'Description',
      public: 'Show on the pricing page',
      create: 'Create coupon',
      active: 'Active',
      used: 'used',
      unlimited: 'unlimited',
      remove: 'Delete',
      confirmRemove: 'Delete this coupon?',
      none: 'No coupons.'
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
      COUPON_NOT_FOUND: 'Unknown coupon.',
      COUPON_INACTIVE: 'Coupon is disabled.',
      COUPON_NOT_STARTED: 'Coupon is not valid yet.',
      COUPON_EXPIRED: 'Coupon has expired.',
      COUPON_EXHAUSTED: 'Coupon has no redemptions left.',
      COUPON_FREE_PLAN: 'Coupons do not apply to the Free plan.',
      COUPON_WRONG_TIER: 'The coupon does not cover this plan.',
      COUPON_WRONG_BILLING: 'The coupon does not cover this billing period.',
      COUPON_EXISTS: 'A coupon with this code already exists.',
      INVALID_COUPON: 'Invalid coupon: use exactly one discount type and a 3-32 character code.',
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

  const pendingCount = data?.waitlist.filter((entry) => entry.status === 'PENDING').length ?? 0;
  const tabs: Array<{ key: Tab; icon: IconName; label: string; badge?: number }> = [
    { key: 'servers', icon: 'grid', label: c.tabs.servers },
    { key: 'beta', icon: 'users', label: c.tabs.beta, badge: pendingCount },
    { key: 'coupons', icon: 'key', label: c.tabs.coupons },
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
              <div className="metric"><span>{c.pending}</span><strong>{pendingCount}</strong></div>
              <div className="metric"><span>{c.tabs.coupons}</span><strong>{data.coupons.filter((coupon) => coupon.active).length}</strong></div>
            </div>

            <nav className="console-tabs" aria-label={c.kicker}>
              {tabs.map((item) => (
                <button key={item.key} className={tab === item.key ? 'active' : ''} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>
                  <Icon name={item.icon} size={15} />{item.label}{item.badge ? <span className="console-badge">{item.badge}</span> : null}
                </button>
              ))}
            </nav>

            {tab === 'servers' && <ServersTab data={data} c={c} locale={locale} action={action} fmt={fmt} />}
            {tab === 'beta' && <BetaTab data={data} c={c} locale={locale} action={action} fmt={fmt} />}
            {tab === 'coupons' && <CouponsTab data={data} c={c} locale={locale} action={action} fmt={fmt} />}
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
                  {expires && <small className={expired ? 'text-danger' : ''}>{expired ? c.plan.expired : c.plan.expiresOn} {expires.toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB')}</small>}
                </div>
                <div className="super-guild-actions">
                  <button className="button button-sm button-premium" onClick={() => setEditing(editing === guild.id ? null : guild.id)}>{editing === guild.id ? c.close : c.managePlan}</button>
                  <button className="button button-sm button-secondary" onClick={() => leave(guild)}>{c.leave}</button>
                  <button className="button button-sm button-danger" onClick={() => blockGuild(guild)}>{c.blockLeave}</button>
                </div>
              </div>
              {editing === guild.id && <PlanEditor guild={guild} data={data} c={c} locale={locale} action={action} onDone={() => setEditing(null)} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}

const toDateInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 10) : '';

function PlanEditor({ guild, data, c, locale, action, onDone }: { guild: Guild; data: Overview; c: Copy; locale: Locale; action: Action; onDone: () => void }) {
  const [tier, setTier] = useState<PlanTier>(guild.plan?.planTier ?? 'FREE');
  const [billing, setBilling] = useState(guild.plan?.planBilling ?? 'MONTHLY');
  const [expires, setExpires] = useState(toDateInput(guild.plan?.planExpiresAt ?? null));
  const [coupon, setCoupon] = useState(guild.plan?.planCouponCode ?? '');
  const [note, setNote] = useState(guild.plan?.planNote ?? '');
  const free = tier === 'FREE';

  const plan = data.planCatalog.find((item) => item.tier === tier);
  const base = !plan || free ? 0 : billing === 'YEARLY' ? plan.yearlyCents : billing === 'MONTHLY' ? plan.monthlyCents : 0;
  const matched = data.coupons.find((item) => item.code === coupon.trim().toUpperCase());
  const final = useMemo(() => {
    if (!matched) return base;
    let price = base;
    if (matched.percentOff) price = Math.round(price * (100 - matched.percentOff) / 100);
    if (matched.amountOffCents) price -= matched.amountOffCents;
    return Math.max(0, price);
  }, [base, matched]);

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
        billing: free ? null : billing,
        // End of the chosen day, in the browser's time zone.
        expiresAt: free || !expires ? null : new Date(`${expires}T23:59:59`).toISOString(),
        couponCode: free ? null : coupon.trim() || null,
        note: note.trim() || null
      })
    }).then(onDone, ignore);
  };

  return (
    <div className="plan-editor">
      <div className="inline-fields">
        <label>{c.plan.tier}<select value={tier} onChange={(e) => setTier(e.target.value as PlanTier)}>
          {TIER_ORDER.map((item) => <option key={item} value={item}>{tierLabel(item, locale)}</option>)}
        </select></label>
        <label>{c.plan.billing}<select disabled={free} value={billing} onChange={(e) => setBilling(e.target.value)}>
          <option value="MONTHLY">{c.plan.monthly}</option>
          <option value="YEARLY">{c.plan.yearly}</option>
          <option value="GIFT">{c.plan.gift}</option>
        </select></label>
        <label>{c.plan.expires}<input disabled={free} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        <label>{c.plan.coupon}<input disabled={free} value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} list={`coupons-${guild.id}`} placeholder="BETA50" />
          <datalist id={`coupons-${guild.id}`}>{data.coupons.filter((item) => item.active).map((item) => <option key={item.id} value={item.code} />)}</datalist>
        </label>
      </div>
      {!free && <div className="plan-editor-quick">
        <button type="button" className="button button-sm button-ghost" onClick={() => extend(1)}>{c.plan.plusMonth}</button>
        <button type="button" className="button button-sm button-ghost" onClick={() => extend(12)}>{c.plan.plusYear}</button>
        <button type="button" className="button button-sm button-ghost" onClick={() => setExpires('')}>{c.plan.noExpiry}</button>
        <span className="plan-editor-price">{c.plan.price}: {matched && final !== base ? <><s>{formatPrice(base, locale)}</s> <strong>{formatPrice(final, locale)}</strong></> : <strong>{formatPrice(base, locale)}</strong>}</span>
      </div>}
      <label>{c.plan.note}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={c.plan.notePlaceholder} /></label>
      <button className="button button-primary" onClick={save}>{c.plan.save}</button>
    </div>
  );
}

/* --------------------------------------------------------------------- beta */

function BetaTab({ data, c, locale, action, fmt }: TabProps) {
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [email, setEmail] = useState(data.config.contactEmail ?? '');
  const [discord, setDiscord] = useState(data.config.contactDiscord ?? '');
  const [url, setUrl] = useState(data.config.contactUrl ?? '');
  const entries = data.waitlist.filter((entry) => filter === 'ALL' || entry.status === filter);

  const toggleOpen = () => action('/backend/api/super/config', { method: 'PUT', body: JSON.stringify({ waitlistOpen: !data.config.waitlistOpen }) }).catch(ignore);
  const saveContacts = () => action('/backend/api/super/config', {
    method: 'PUT',
    body: JSON.stringify({ contactEmail: email.trim() || null, contactDiscord: discord.trim() || null, contactUrl: url.trim() || null })
  }).catch(ignore);
  const review = (entry: WaitlistEntry, next: WaitlistEntry['status']) =>
    action(`/backend/api/super/waitlist/${entry.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) }).catch(ignore);
  const remove = (entry: WaitlistEntry) => {
    if (confirm(c.beta.confirmRemove)) action(`/backend/api/super/waitlist/${entry.id}`, { method: 'DELETE' }).catch(ignore);
  };

  return <>
    <div className="two-col">
      <section className="card">
        <span className="kicker">Beta</span>
        <h2>{c.beta.title}</h2>
        <p>{c.beta.text}</p>
        <div className="toggle-row">
          <div><strong>{c.beta.open}</strong><span>{c.beta.openText}</span></div>
          <button className={`switch ${data.config.waitlistOpen ? 'on' : ''}`} aria-pressed={data.config.waitlistOpen} aria-label={c.beta.open} onClick={toggleOpen}><i /></button>
        </div>
        <a className="button button-secondary button-sm" href={`/${locale}/beta`} target="_blank" rel="noreferrer">/{locale}/beta<Icon name="arrowRight" size={13} /></a>
      </section>
      <section className="card">
        <span className="kicker">{c.beta.contacts}</span>
        <h2>{c.beta.contacts}</h2>
        <p>{c.beta.contactsText}</p>
        <label>{c.beta.email}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} /></label>
        <label>{c.beta.discord}<input value={discord} onChange={(e) => setDiscord(e.target.value)} maxLength={200} /></label>
        <label>{c.beta.url}<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://" /></label>
        <button className="button button-primary" onClick={saveContacts}>{c.beta.saveContacts}</button>
      </section>
    </div>

    <section className="card">
      <div className="card-head">
        <div><span className="kicker">{c.tabs.beta}</span><h2>{c.pending}</h2></div>
        <div className="segmented">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
              {c.beta.filter[item]} <span className="mono">{item === 'ALL' ? data.waitlist.length : data.waitlist.filter((entry) => entry.status === item).length}</span>
            </button>
          ))}
        </div>
      </div>
      {!entries.length && <div className="empty">{c.beta.none}</div>}
      <div className="table-list">
        {entries.map((entry) => (
          <div className="waitlist-admin-row" key={entry.id}>
            <div>
              <strong>{entry.guildName || entry.guildId}</strong>
              <span className="mono">{entry.guildId} · {entry.memberCount.toLocaleString(locale === 'it' ? 'it-IT' : 'en-US')} {c.members}</span>
              <span>{c.beta.requester} {entry.username} <span className="mono">({entry.userId})</span> · {fmt(entry.createdAt)}</span>
              {entry.note && <p>{entry.note}</p>}
            </div>
            <div className="waitlist-admin-tags">
              <span className={`tag ${entry.status === 'APPROVED' ? 'tag-ok' : entry.status === 'REJECTED' ? 'tag-danger' : 'tag-warn'}`}>{c.beta.filter[entry.status]}</span>
              {entry.installed && <span className="tag">{c.beta.installed}</span>}
            </div>
            <div className="super-guild-actions">
              {entry.status !== 'APPROVED' && <button className="button button-sm button-primary" onClick={() => review(entry, 'APPROVED')}>{c.beta.approve}</button>}
              {entry.status !== 'REJECTED' && <button className="button button-sm button-secondary" onClick={() => review(entry, 'REJECTED')}>{c.beta.reject}</button>}
              {entry.status !== 'PENDING' && <button className="button button-sm button-ghost" onClick={() => review(entry, 'PENDING')}>{c.beta.reset}</button>}
              <button className="button button-sm button-danger" onClick={() => remove(entry)}>{c.beta.remove}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  </>;
}

/* ------------------------------------------------------------------ coupons */

const emptyCoupon = { code: '', type: 'percent', value: '', tiers: [] as string[], billing: 'ANY', max: '', from: '', until: '', description: '', public: false };

function CouponsTab({ data, c, locale, action, fmt }: TabProps) {
  const [form, setForm] = useState(emptyCoupon);
  const set = (patch: Partial<typeof emptyCoupon>) => setForm((current) => ({ ...current, ...patch }));

  const create = () => {
    const value = Number(form.value.replace(',', '.'));
    action('/backend/api/super/coupons', {
      method: 'POST',
      body: JSON.stringify({
        code: form.code.trim(),
        description: form.description.trim() || null,
        percentOff: form.type === 'percent' ? Math.round(value) || null : null,
        amountOffCents: form.type === 'amount' ? Math.round(value * 100) || null : null,
        tiers: form.tiers,
        billing: form.billing,
        maxRedemptions: form.max ? Number(form.max) : null,
        validFrom: form.from ? new Date(`${form.from}T00:00:00`).toISOString() : null,
        validUntil: form.until ? new Date(`${form.until}T23:59:59`).toISOString() : null,
        public: form.public
      })
    }).then(() => setForm(emptyCoupon), ignore);
  };
  const update = (coupon: Coupon, patch: Partial<Coupon>) =>
    action(`/backend/api/super/coupons/${coupon.id}`, { method: 'PUT', body: JSON.stringify(patch) }).catch(ignore);
  const remove = (coupon: Coupon) => {
    if (confirm(c.coupons.confirmRemove)) action(`/backend/api/super/coupons/${coupon.id}`, { method: 'DELETE' }).catch(ignore);
  };
  const date = (value: string | null) => value ? fmt(value).split(',')[0] : '…';

  return (
    <section className="card">
      <div className="card-head"><div><span className="kicker">{c.tabs.coupons}</span><h2>{c.coupons.title}</h2><p>{c.coupons.text}</p></div></div>
      <div className="coupon-form">
        <label>{c.coupons.code}<input value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} maxLength={32} placeholder="BETA50" /></label>
        <label>{c.coupons.type}<select value={form.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="percent">{c.coupons.percent}</option>
          <option value="amount">{c.coupons.amount}</option>
        </select></label>
        <label>{c.coupons.value}<input value={form.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d.,]/g, '') })} inputMode="decimal" placeholder={form.type === 'percent' ? '50' : '5'} /></label>
        <label>{c.coupons.billing}<select value={form.billing} onChange={(e) => set({ billing: e.target.value })}>
          <option value="ANY">{c.coupons.any}</option>
          <option value="MONTHLY">{c.plan.monthly}</option>
          <option value="YEARLY">{c.plan.yearly}</option>
        </select></label>
        <label>{c.coupons.max}<input value={form.max} onChange={(e) => set({ max: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="∞" /></label>
        <label>{c.coupons.from}<input type="date" value={form.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label>{c.coupons.until}<input type="date" value={form.until} onChange={(e) => set({ until: e.target.value })} /></label>
        <label className="coupon-wide">{c.coupons.description}<input value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={200} /></label>
        <fieldset className="coupon-tiers">
          <legend>{c.coupons.tiers}</legend>
          {(['TIER1', 'TIER2', 'TIER3'] as const).map((tier) => (
            <label key={tier} className="check"><input type="checkbox" checked={form.tiers.includes(tier)} onChange={(e) => set({ tiers: e.target.checked ? [...form.tiers, tier] : form.tiers.filter((item) => item !== tier) })} />{tierLabel(tier, locale)}</label>
          ))}
          {!form.tiers.length && <small>{c.coupons.allTiers}</small>}
        </fieldset>
        <label className="check coupon-public"><input type="checkbox" checked={form.public} onChange={(e) => set({ public: e.target.checked })} />{c.coupons.public}</label>
        <button className="button button-primary" onClick={create}>{c.coupons.create}</button>
      </div>

      {!data.coupons.length && <div className="empty">{c.coupons.none}</div>}
      <div className="table-list">
        {data.coupons.map((coupon) => (
          <div className="coupon-row" key={coupon.id}>
            <div>
              <strong className="mono">{coupon.code}</strong>
              <span>{coupon.percentOff ? `-${coupon.percentOff}%` : `-${formatPrice(coupon.amountOffCents ?? 0, locale)}`} · {coupon.tiers.length ? coupon.tiers.map((tier) => tierLabel(tier, locale)).join(', ') : c.coupons.allTiers} · {coupon.billing === 'ANY' ? c.coupons.any : coupon.billing === 'YEARLY' ? c.plan.yearly : c.plan.monthly}</span>
              <span>{coupon.redemptions} {c.coupons.used} / {coupon.maxRedemptions ?? c.coupons.unlimited} · {date(coupon.validFrom)} → {date(coupon.validUntil)}</span>
              {coupon.description && <span>{coupon.description}</span>}
            </div>
            <label className="check"><input type="checkbox" checked={coupon.active} onChange={(e) => update(coupon, { active: e.target.checked })} />{c.coupons.active}</label>
            <label className="check"><input type="checkbox" checked={coupon.public} onChange={(e) => update(coupon, { public: e.target.checked })} />{c.pricing}</label>
            <button className="button button-sm button-danger" onClick={() => remove(coupon)}>{c.coupons.remove}</button>
          </div>
        ))}
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
