'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Brand';
import { LanguageSwitcher } from './LanguageSwitcher';
import { localizeCategory, localizeEvent, type Locale } from '../i18n';
import { TIER_ORDER, formatLimit, formatNumber, limitLabels, planErrorMessage, tierLabel, tierShort, type Plan, type PlanTier } from './plans';

type Settings = {
  guildId: string;
  guildName: string;
  iconUrl: string | null;
  defaultLogChannelId: string | null;
  timezone: string;
  locale: string;
  defaultRetentionDays: number;
  embedColor: string;
  embedFooter: string;
  messageSnapshotEnabled: boolean;
  storeMessageContent: boolean;
  rawGatewayEnabled: boolean;
  presenceLoggingEnabled: boolean;
  typingLoggingEnabled: boolean;
  premiumEnabled: boolean;
};

type EventDefinition = { key: string; category: string; label: string; description: string; noisy?: boolean };
type Route = {
  id: string;
  eventKey: string;
  captureEnabled: boolean;
  enabled: boolean;
  destinationChannelId: string | null;
  customTitle: string | null;
  customFooter: string | null;
  textPrefix: string | null;
  thumbnailUrl: string | null;
  embedColor: string | null;
  showTimestamp: boolean;
  showActor: boolean;
  showTarget: boolean;
  showChannel: boolean;
  includeContent: boolean;
  includeAttachments: boolean;
  ignoreBots: boolean;
  retentionDays: number | null;
  ignoredUserIds: string[];
  ignoredRoleIds: string[];
  ignoredChannelIds: string[];
  mentionRoleIds: string[];
};
type RouteRow = { event: EventDefinition; route: Route | null };
type Channel = { id: string; name: string; type: number };
type Role = { id: string; name: string; color: number };
type LogItem = { id: string; eventKey: string; actorId: string | null; targetId: string | null; channelId: string | null; summary: string; details: Record<string, unknown>; dispatchState: string; dispatchError: string | null; createdAt: string };
type Stats = { today: number; last24h: number; snapshots: number; deliveryIssues: number; groups: { eventKey: string; count: number }[]; lastEventAt: string | null };
type PanelAudit = { id: string; username: string; userId: string; action: string; details: Record<string, unknown>; createdAt: string };
type AccessLevel = 'VIEWER' | 'MODERATOR' | 'ADMIN' | 'OWNER';
type AccessBinding = { id: string; discordRoleId: string; accessLevel: 'VIEWER' | 'MODERATOR' | 'ADMIN' };
type LoggerMacro = { key: string; label: string; description: string; categories: string[] };
type PlanInfo = {
  tier: PlanTier;
  effectiveTier: PlanTier;
  expiresAt: string | null;
  billing: string | null;
  plan: Plan;
  usage: { eventsToday: number; logChannels: number; roleBindings: number };
  branding: { nickname: string | null; bannerSet: boolean };
  eventTiers: { TIER1: string[]; TIER2: string[] };
};

const tierIndex = (tier: PlanTier) => TIER_ORDER.indexOf(tier);
const requiredTier = (plan: PlanInfo | null, eventKey: string): PlanTier =>
  plan?.eventTiers.TIER2.includes(eventKey) ? 'TIER2' : plan?.eventTiers.TIER1.includes(eventKey) ? 'TIER1' : 'FREE';

const textChannelTypes = new Set([0, 2, 5]);

const LOGGER_MACROS: LoggerMacro[] = [
  {
    key: 'members',
    label: 'Membri & moderazione',
    description: 'Ingressi, uscite, profili, provvedimenti, Audit Log, AutoMod e presenza.',
    categories: ['Utenti', 'Moderazione', 'Audit', 'AutoMod', 'Presenza']
  },
  {
    key: 'messages',
    label: 'Messaggi & conversazioni',
    description: 'Messaggi, reaction, poll, thread e interazioni con il bot.',
    categories: ['Messaggi', 'Reazioni', 'Thread', 'Interazioni']
  },
  {
    key: 'server',
    label: 'Server & struttura',
    description: 'Canali, ruoli, inviti, webhook, integrazioni e impostazioni del server.',
    categories: ['Server', 'Canali', 'Ruoli', 'Inviti', 'Webhook', 'Applicazioni', 'Integrazioni']
  },
  {
    key: 'voice',
    label: 'Voce & attività',
    description: 'Canali vocali, Stage, eventi programmati e soundboard.',
    categories: ['Vocale', 'Stage', 'Eventi', 'Soundboard']
  },
  {
    key: 'content',
    label: 'Contenuti & personalizzazione',
    description: 'Emoji, sticker e altri elementi personalizzati del server.',
    categories: ['Espressioni']
  },
  {
    key: 'system',
    label: 'Sistema & avanzato',
    description: 'Disponibilità del server e diagnostica Gateway avanzata.',
    categories: ['Sistema', 'Avanzato']
  }
];

class ApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly body: Record<string, unknown> = {}) {
    super(code);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new ApiError(typeof body.error === 'string' ? body.error : `HTTP_${response.status}`, response.status, body);
  }
  return response.json() as Promise<T>;
}

const errorMessage = (error: unknown, locale: Locale) => {
  const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR';
  const plan = error instanceof ApiError ? planErrorMessage(error.body as { error?: string; limit?: string; max?: number; required?: string }, locale) : null;
  if (plan) return plan;
  const it: Record<string, string> = {
    PREMIUM_REQUIRED: 'Questa funzione richiede un piano superiore.',
    BRANDING_MISSING_PERMISSION: 'Il bot non ha il permesso “Cambia nickname” in questo server.',
    BRANDING_FAILED: 'Discord ha rifiutato la modifica del profilo del bot.',
    UNKNOWN_GUILD_REFERENCE: 'Canale o ruolo non trovato in questo server.',
    INVALID_BODY: 'Valore non valido.',
    FORBIDDEN: 'Permessi insufficienti.',
    UNAUTHORIZED: 'Sessione scaduta: accedi di nuovo.',
    RATE_LIMITED: 'Troppe richieste, riprova tra poco.',
    DISCORD_RESOURCES_FAILED: 'Impossibile verificare i dati su Discord.'
  };
  const en: Record<string, string> = {
    PREMIUM_REQUIRED: 'This feature requires a higher plan.',
    BRANDING_MISSING_PERMISSION: 'The bot lacks the “Change Nickname” permission in this server.',
    BRANDING_FAILED: 'Discord rejected the bot profile change.',
    UNKNOWN_GUILD_REFERENCE: 'Channel or role not found in this server.',
    INVALID_BODY: 'Invalid value.',
    FORBIDDEN: 'Insufficient permissions.',
    UNAUTHORIZED: 'Session expired: sign in again.',
    RATE_LIMITED: 'Too many requests, try again shortly.',
    DISCORD_RESOURCES_FAILED: 'Unable to verify data on Discord.'
  };
  const normalized = error instanceof ApiError && error.status === 429 ? 'RATE_LIMITED' : code;
  const table = locale === 'it' ? it : en;
  return table[normalized] ?? (locale === 'it' ? `Operazione non riuscita (${normalized}).` : `Operation failed (${normalized}).`);
};

// Coalesces rapid edits (color pickers, number fields) into a single request.
function useDebouncedCallback() {
  const timers = useRef(new Map<string, number>());
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  return useCallback((key: string, run: () => void, delay = 500) => {
    const existing = timers.current.get(key);
    if (existing) window.clearTimeout(existing);
    timers.current.set(key, window.setTimeout(() => {
      timers.current.delete(key);
      run();
    }, delay));
  }, []);
}

export default function GuildDashboard({ guildId, locale }: { guildId: string; locale: Locale }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const macroCopy = (macro: LoggerMacro) => {
    if (locale === 'it') return { label: macro.label, description: macro.description };
    const english: Record<string, { label: string; description: string }> = {
      members: { label: 'Members & moderation', description: 'Joins, leaves, profiles, moderation actions, Audit Log, AutoMod and presence.' },
      messages: { label: 'Messages & conversations', description: 'Messages, reactions, polls, threads and bot interactions.' },
      server: { label: 'Server & structure', description: 'Channels, roles, invites, webhooks, integrations and server settings.' },
      voice: { label: 'Voice & activity', description: 'Voice channels, Stage, scheduled events and soundboard.' },
      content: { label: 'Content & customization', description: 'Emoji, stickers and other custom server elements.' },
      system: { label: 'System & advanced', description: 'Server availability and advanced Gateway diagnostics.' },
      other: { label: 'Other loggers', description: 'Events not yet assigned to a macro category.' }
    };
    return english[macro.key] ?? { label: macro.label, description: macro.description };
  };
  const [tab, setTab] = useState<'overview' | 'events' | 'history' | 'admin'>('overview');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<LogItem[]>([]);
  const [panelLog, setPanelLog] = useState<PanelAudit[]>([]);
  const [access, setAccess] = useState<AccessLevel>('VIEWER');
  const [bindings, setBindings] = useState<AccessBinding[]>([]);
  const [filter, setFilter] = useState('');
  const [openMacro, setOpenMacro] = useState<string | null>(null);
  const [historyEvent, setHistoryEvent] = useState('');
  const [historyText, setHistoryText] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [retentionDraft, setRetentionDraft] = useState('');
  const [status, setStatus] = useState('');
  const debounce = useDebouncedCallback();
  const statusTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((message: string, duration = 1800) => {
    setStatus(message);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(''), duration);
  }, []);

  const loadPlan = useCallback(() => api<PlanInfo>(`/backend/api/guilds/${guildId}/plan`).then(setPlan).catch(() => null), [guildId]);

  const load = async () => {
    void loadPlan();
    const [s, r, resources, st, ac] = await Promise.all([
      api<Settings>(`/backend/api/guilds/${guildId}/settings`),
      api<RouteRow[]>(`/backend/api/guilds/${guildId}/routes`),
      api<{ channels: Channel[]; roles: Role[] }>(`/backend/api/guilds/${guildId}/resources`),
      api<Stats>(`/backend/api/guilds/${guildId}/stats`),
      api<{ access: AccessLevel }>(`/backend/api/guilds/${guildId}/access`)
    ]);
    setSettings(s); setRoutes(r); setChannels(resources.channels); setRoles(resources.roles); setStats(st); setAccess(ac.access);
    setRetentionDraft(String(s.defaultRetentionDays));
  };

  useEffect(() => { load().catch(() => setStatus(L('Errore durante il caricamento.', 'Error while loading.'))); }, [guildId, locale]);

  // Search on pause instead of on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setHistoryQuery(historyText.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [historyText]);

  useEffect(() => { setHistoryPage(1); }, [historyEvent, historyQuery]);

  useEffect(() => {
    if (tab !== 'history') return;
    let cancelled = false;
    const qs = new URLSearchParams({ take: '100', page: String(historyPage) });
    if (historyEvent) qs.set('eventKey', historyEvent);
    if (historyQuery) qs.set('q', historyQuery);
    setHistoryLoading(true);
    api<{ items: LogItem[]; pages: number }>(`/backend/api/guilds/${guildId}/events?${qs}`)
      .then((x) => {
        if (cancelled) return;
        setHistory((current) => historyPage === 1 ? x.items : [...current, ...x.items]);
        setHistoryPages(x.pages);
      })
      .catch(() => { if (!cancelled) setStatus(L('Impossibile caricare lo storico.', 'Unable to load history.')); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [tab, guildId, historyEvent, historyQuery, historyPage]);

  useEffect(() => {
    if (tab !== 'admin') return;
    Promise.all([
      api<PanelAudit[]>(`/backend/api/guilds/${guildId}/panel-audit`),
      api<AccessBinding[]>(`/backend/api/guilds/${guildId}/access-bindings`)
    ]).then(([audit, roleBindings]) => { setPanelLog(audit); setBindings(roleBindings); }).catch(() => setStatus(L('Impossibile caricare l’amministrazione.', 'Unable to load administration.')));
  }, [tab, guildId]);

  const macroGroups = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const matches = routes.filter(({ event }) => {
      const translated = localizeEvent(event, locale);
      return `${event.label} ${event.key} ${event.category} ${event.description} ${translated.label} ${translated.category} ${translated.description}`.toLowerCase().includes(query);
    });
    const assigned = new Set<string>();
    const groups: { macro: LoggerMacro; rows: RouteRow[] }[] = LOGGER_MACROS.map((macro) => {
      const rows = matches.filter(({ event }) => macro.categories.includes(event.category));
      rows.forEach(({ event }) => assigned.add(event.key));
      return { macro, rows };
    }).filter(({ rows }) => rows.length > 0);

    const otherRows = matches.filter(({ event }) => !assigned.has(event.key));
    if (otherRows.length) {
      groups.push({
        macro: {
          key: 'other',
          label: 'Altri logger',
          description: 'Eventi non ancora assegnati a una macro-categoria.',
          categories: Array.from(new Set(otherRows.map(({ event }) => event.category)))
        },
        rows: otherRows
      });
    }
    return groups;
  }, [routes, filter, locale]);
  const textChannels = channels.filter((c) => textChannelTypes.has(c.type));
  const canAdmin = access === 'ADMIN' || access === 'OWNER';
  const tier: PlanTier = plan?.effectiveTier ?? 'FREE';
  const maxRetention = plan?.plan.limits.retentionDays ?? 3650;
  const advancedAllowed = tierIndex(tier) >= tierIndex('TIER2');
  const canModerate = canAdmin || access === 'MODERATOR';
  const formatDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'it-IT', { dateStyle: 'short', timeStyle: 'medium', timeZone: settings?.timezone || 'Europe/Rome' }).format(new Date(value));
    } catch {
      return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'it-IT');
    }
  };

  // Optimistic update with rollback: the UI never keeps showing a value the
  // server rejected (e.g. PREMIUM_REQUIRED or a foreign channel).
  const persistSettings = async (patch: Partial<Settings>, previous: Settings) => {
    try {
      const saved = await api<Settings>(`/backend/api/guilds/${guildId}/settings`, { method: 'PUT', body: JSON.stringify(patch) });
      // Only adopt the fields this request changed, so other inputs being
      // edited at the same time keep their local value.
      setSettings((current) => current ? { ...current, ...Object.fromEntries(Object.keys(patch).map((key) => [key, saved[key as keyof Settings]])) } : saved);
      if ('defaultRetentionDays' in patch) setRetentionDraft(String(saved.defaultRetentionDays));
      if ('defaultLogChannelId' in patch) void loadPlan();
      flash(L('Impostazioni salvate.', 'Settings saved.'));
    } catch (error) {
      setSettings((current) => current ? { ...current, ...Object.fromEntries(Object.keys(patch).map((key) => [key, previous[key as keyof Settings]])) } : current);
      if ('defaultRetentionDays' in patch) setRetentionDraft(String(previous.defaultRetentionDays));
      flash(errorMessage(error, locale), 4000);
    }
  };

  const saveSettings = (patch: Partial<Settings>, options: { debounceKey?: string } = {}) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    if (options.debounceKey) debounce(options.debounceKey, () => void persistSettings(patch, previous));
    else void persistSettings(patch, previous);
  };

  const saveRoute = async (eventKey: string, patch: Partial<Route>) => {
    const previous = routes.find((row) => row.event.key === eventKey)?.route ?? null;
    setRoutes((current) => current.map((row) => row.event.key === eventKey ? { ...row, route: { ...(row.route as Route), eventKey, ...patch } } : row));
    try {
      const saved = await api<Route>(`/backend/api/guilds/${guildId}/routes/${encodeURIComponent(eventKey)}`, { method: 'PUT', body: JSON.stringify(patch) });
      setRoutes((current) => current.map((row) => row.event.key === eventKey ? { ...row, route: saved } : row));
      if ('destinationChannelId' in patch) void loadPlan();
      flash(L('Logger aggiornato.', 'Logger updated.'), 1400);
    } catch (error) {
      setRoutes((current) => current.map((row) => row.event.key === eventKey ? { ...row, route: previous } : row));
      flash(errorMessage(error, locale), 4000);
    }
  };

  const saveRouteDebounced = (eventKey: string, patch: Partial<Route>, key: string) => {
    setRoutes((current) => current.map((row) => row.event.key === eventKey ? { ...row, route: { ...(row.route as Route), eventKey, ...patch } } : row));
    debounce(`${eventKey}:${key}`, () => void saveRoute(eventKey, patch));
  };

  const bulk = async (enabled: boolean, includeNoisy = false) => {
    try {
      await api(`/backend/api/guilds/${guildId}/routes/bulk`, { method: 'POST', body: JSON.stringify({ enabled, includeNoisy }) });
      await load();
      flash(L('Logger aggiornati.', 'Loggers updated.'));
    } catch (error) {
      flash(errorMessage(error, locale), 4000);
    }
  };

  const commitRetention = () => {
    if (!settings) return;
    const value = Math.round(Number(retentionDraft));
    if (!Number.isFinite(value) || value < 1 || value > maxRetention) {
      setRetentionDraft(String(settings.defaultRetentionDays));
      flash(L(`La retention deve essere tra 1 e ${maxRetention} giorni con il tuo piano.`, `Retention must be between 1 and ${maxRetention} days on your plan.`), 3000);
      return;
    }
    if (value !== settings.defaultRetentionDays) saveSettings({ defaultRetentionDays: value });
  };

  if (!settings) return <main className="loading">{L('Caricamento pannello…', 'Loading dashboard…')}</main>;

  const tabs = [
    { key: 'overview' as const, icon: 'grid' as const, label: L('Panoramica', 'Overview'), description: L('Attività recente e impostazioni principali del server.', 'Recent activity and the server’s main settings.') },
    { key: 'events' as const, icon: 'sliders' as const, label: 'Logger', description: L('Scegli cosa registrare, cosa inviare su Discord e dove.', 'Choose what to record, what to send to Discord and where.') },
    { key: 'history' as const, icon: 'search' as const, label: L('Storico', 'History'), description: L('Cerca negli eventi registrati ed esportali.', 'Search recorded events and export them.') },
    ...(canAdmin ? [{ key: 'admin' as const, icon: 'key' as const, label: L('Amministrazione', 'Administration'), description: L('Accessi al pannello, registro delle modifiche e privacy.', 'Panel access, change log and privacy.') }] : [])
  ];
  const current = tabs.find((item) => item.key === tab) ?? tabs[0]!;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="sidebar-back" href={`/${locale}/dashboard`}><Icon name="arrowLeft" size={14} />{L('Tutti i server', 'All servers')}</a>
        <div className="sidebar-guild">
          {settings.iconUrl ? <img src={settings.iconUrl} alt="" /> : <div className="guild-placeholder">{settings.guildName.slice(0, 1)}</div>}
          <div>
            <strong title={settings.guildName}>{settings.guildName}</strong>
            <span className={`tag ${tier !== 'FREE' ? 'tag-premium' : ''}`}>{tierShort(tier)}</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label={L('Sezioni', 'Sections')}>
          {tabs.map((item) => (
            <button key={item.key} className={tab === item.key ? 'active' : ''} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>
              <Icon name={item.icon} size={17} />{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-access"><span>{L('Il tuo accesso', 'Your access')}</span><strong className="mono">{access}</strong></div>
          <LanguageSwitcher locale={locale} itHref={`/it/dashboard/${guildId}`} enHref={`/en/dashboard/${guildId}`} compact />
        </div>
      </aside>

      {status && <div className="toast" role="status">{status}</div>}

      <main className="workspace">
        <header className="workspace-head">
          <div>
            <span className="kicker">{settings.guildName}</span>
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          <div className="live-pill"><i />{L('Audit attivo', 'Audit active')}</div>
        </header>

      <section className="content">
        {!canAdmin && <div className="notice">{L('Accesso pannello:', 'Panel access:')} <strong>{access}</strong>. {L('Le impostazioni sono in sola lettura.', 'Settings are read-only.')}</div>}
        {tab === 'overview' && <>
          <div className="stat-grid">
            <div className="stat-card"><span>{L('Eventi oggi', 'Events today')}</span><strong>{stats?.today ?? 0}</strong></div>
            <div className="stat-card"><span>{L('Ultime 24 ore', 'Last 24 hours')}</span><strong>{stats?.last24h ?? 0}</strong></div>
            <div className="stat-card"><span>{L('Snapshot messaggi', 'Message snapshots')}</span><strong>{stats?.snapshots ?? 0}</strong></div>
            <div className="stat-card"><span>Retention</span><strong>{settings.defaultRetentionDays}<small>{L(' giorni', ' days')}</small></strong></div>
            <div className={`stat-card ${stats?.deliveryIssues ? 'stat-alert' : ''}`}><span>{L('Problemi invio 24h', 'Delivery issues 24h')}</span><strong>{stats?.deliveryIssues ?? 0}</strong></div>
          </div>

          {plan && <PlanPanel plan={plan} locale={locale} />}

          <div className="two-col">
            <section className="panel">
              <div className="panel-title"><div><p className="eyebrow">{L('DESTINAZIONE', 'DESTINATION')}</p><h2>{L('Impostazioni generali', 'General settings')}</h2></div></div>
              <label>{L('Canale log predefinito', 'Default log channel')}<SearchableSelect
                disabled={!canAdmin}
                value={settings.defaultLogChannelId ?? ''}
                onChange={(value) => saveSettings({ defaultLogChannelId: value || null })}
                placeholder={L('Cerca un canale…', 'Search channels…')}
                options={[
                  { value: '', label: L('Nessuno', 'None') },
                  ...textChannels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))
                ]}
              /></label>
              <label>{L('Retention dati', 'Data retention')} <small className="field-help">{L(`max ${maxRetention} giorni`, `max ${maxRetention} days`)}</small><input disabled={!canAdmin} type="number" min="1" max={maxRetention} value={retentionDraft} onChange={(e) => setRetentionDraft(e.target.value)} onBlur={commitRetention} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
              <div className="inline-fields"><label>{L('Fuso orario', 'Timezone')}<input disabled={!canAdmin} value={settings.timezone} placeholder="Europe/Rome" onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} onBlur={() => saveSettings({ timezone: settings.timezone.trim() })} /></label><label>{L('Lingua embed', 'Embed language')}<select disabled={!canAdmin} value={settings.locale === 'it' ? 'it' : 'en'} onChange={(e) => saveSettings({ locale: e.target.value as 'en' | 'it' })}><option value="en">English</option><option value="it">Italiano</option></select></label></div>
              <div className="inline-fields"><label>{L('Colore embed', 'Embed color')}<input disabled={!canAdmin} type="color" value={settings.embedColor} onChange={(e) => saveSettings({ embedColor: e.target.value }, { debounceKey: 'embedColor' })} /></label><label>Footer<input disabled={!canAdmin} value={settings.embedFooter} onChange={(e) => setSettings({ ...settings, embedFooter: e.target.value })} onBlur={() => saveSettings({ embedFooter: settings.embedFooter })} /></label></div>
            </section>

            <section className="panel">
              <div className="panel-title"><div><p className="eyebrow">{L('DATI', 'DATA')}</p><h2>{L('Acquisizione', 'Collection')}</h2></div></div>
              <Toggle disabled={!canAdmin} label={L('Snapshot messaggi', 'Message snapshots')} description={L('Conserva una copia per ricostruire i messaggi eliminati.', 'Keep a copy to reconstruct deleted messages.')} checked={settings.messageSnapshotEnabled} onChange={(value) => saveSettings({ messageSnapshotEnabled: value })} />
              <Toggle disabled={!canAdmin} label={L('Contenuto messaggi', 'Message content')} description={L('Salva testo ed embed negli snapshot.', 'Store text and embeds in snapshots.')} checked={settings.storeMessageContent} onChange={(value) => saveSettings({ storeMessageContent: value })} />
              <Toggle disabled={!canAdmin || !advancedAllowed} label={L('Presenze · Pro', 'Presence · Pro')} description={advancedAllowed ? L('Status e attività. Può generare molti eventi.', 'Status and activity. This can generate many events.') : L('Richiede il Livello 2 · Pro.', 'Requires Level 2 · Pro.')} checked={settings.presenceLoggingEnabled} onChange={(value) => saveSettings({ presenceLoggingEnabled: value })} />
              <Toggle disabled={!canAdmin || !advancedAllowed} label="Typing · Pro" description={advancedAllowed ? L('Registra quando un utente inizia a scrivere.', 'Record when a user starts typing.') : L('Richiede il Livello 2 · Pro.', 'Requires Level 2 · Pro.')} checked={settings.typingLoggingEnabled} onChange={(value) => saveSettings({ typingLoggingEnabled: value })} />
              <Toggle disabled={!canAdmin || !advancedAllowed} label="Gateway raw · Pro" description={advancedAllowed ? L('Debug avanzato: salva eventi Gateway grezzi.', 'Advanced debug: store raw Gateway events.') : L('Richiede il Livello 2 · Pro.', 'Requires Level 2 · Pro.')} checked={settings.rawGatewayEnabled} onChange={(value) => saveSettings({ rawGatewayEnabled: value })} danger />
            </section>
          </div>

          <section className="panel">
            <div className="panel-title"><div><p className="eyebrow">{L('VOLUME', 'VOLUME')}</p><h2>{L('Eventi nelle ultime 24 ore', 'Events in the last 24 hours')}</h2></div></div>
            <div className="bars">{stats?.groups.map((g) => <div className="bar-row" key={g.eventKey}><span>{g.eventKey}</span><div><i style={{ width: `${Math.max(3, Math.min(100, g.count / Math.max(...stats.groups.map(x => x.count), 1) * 100))}%` }} /></div><b>{g.count}</b></div>)}</div>
          </section>
        </>}

        {tab === 'events' && <>
          {tier !== 'TIER2' && tier !== 'TIER3' && <div className="notice premium-notice">{L('Alcuni logger ad alto volume richiedono il Livello 1 · Plus o il Livello 2 · Pro.', 'Some high-volume loggers require Level 1 · Plus or Level 2 · Pro.')} <a className="inline-link" href={`/${locale}/pricing`}>{L('Vedi i piani', 'See plans')}</a></div>}
          <div className="toolbar logger-toolbar">
            <input placeholder={L('Cerca logger, evento o categoria…', 'Search logger, event or category…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button disabled={!canAdmin} onClick={() => bulk(true, false)}>{L('Invia standard', 'Enable standard')}</button>
            <button className="secondary" disabled={!canAdmin} onClick={() => bulk(false, true)}>{L('Ferma invio', 'Stop delivery')}</button>
          </div>

          <div className="logger-macro-list">
            {macroGroups.map(({ macro, rows }) => {
              const expanded = Boolean(filter.trim()) || openMacro === macro.key;
              const active = rows.filter(({ route }) => route?.enabled).length;
              const captured = rows.filter(({ route }) => route?.captureEnabled).length;
              const subcategories = Array.from(new Set(rows.map(({ event }) => event.category)));

              return <section className={`logger-macro ${expanded ? 'open' : ''}`} key={macro.key}>
                <button
                  type="button"
                  className="logger-macro-head"
                  aria-expanded={expanded}
                  onClick={() => setOpenMacro((current) => current === macro.key ? null : macro.key)}
                >
                  <div className="logger-macro-copy">
                    <span className="logger-macro-kicker">{L('MACRO-CATEGORIA', 'MACRO CATEGORY')}</span>
                    <strong>{macroCopy(macro).label}</strong>
                    <p>{macroCopy(macro).description}</p>
                  </div>
                  <div className="logger-macro-meta">
                    <span>{rows.length} {L('logger', 'loggers')}</span>
                    <span>{captured} {L('acquisiti', 'collected')}</span>
                    <span>{active} {L('inviati', 'sent')}</span>
                    <i aria-hidden="true">{expanded ? '−' : '+'}</i>
                  </div>
                </button>

                {expanded && <div className="logger-macro-body">
                  {subcategories.map((subCategory) => {
                    const categoryRows = rows.filter(({ event }) => event.category === subCategory);
                    return <section className="logger-subgroup" key={subCategory}>
                      <div className="logger-subgroup-head">
                        <strong>{localizeCategory(subCategory, locale)}</strong>
                        <span>{categoryRows.length}</span>
                      </div>
                      <div className="route-list">
                        {categoryRows.map(({ event, route }) => <RouteEditor key={event.key} event={event} route={route} channels={textChannels} roles={roles} onSave={(patch) => void saveRoute(event.key, patch)} onSaveDebounced={(patch, key) => saveRouteDebounced(event.key, patch, key)} readOnly={!canAdmin} required={requiredTier(plan, event.key)} tier={tier} locale={locale} />)}
                      </div>
                    </section>;
                  })}
                </div>}
              </section>;
            })}
          </div>
        </>}

        {tab === 'history' && <>
          <div className="toolbar"><input placeholder={L('Cerca nel riepilogo…', 'Search summaries…')} value={historyText} onChange={(e) => setHistoryText(e.target.value)} /><select value={historyEvent} onChange={(e) => setHistoryEvent(e.target.value)}><option value="">{L('Tutti gli eventi', 'All events')}</option>{routes.map(({ event }) => <option key={event.key} value={event.key}>{localizeEvent(event, locale).label}</option>)}</select>{canModerate && <a className="button-link" href={`/backend/api/guilds/${guildId}/export${historyEvent ? `?eventKey=${encodeURIComponent(historyEvent)}` : ''}`}>{L('Esporta JSON', 'Export JSON')}</a>}</div>
          <div className="history-list">{history.map((item) => <article key={item.id} className="history-item"><div><span className="history-meta"><span className="event-key">{item.eventKey}</span><span className={`state state-${item.dispatchState.toLowerCase()}`}>{item.dispatchState.replace(/_/g, ' ').toLowerCase()}</span></span><time className="mono">{formatDate(item.createdAt)}</time></div><strong>{item.summary}</strong><p>{item.actorId ? `${L('Autore', 'Actor')}: ${item.actorId}` : ''}{item.channelId ? ` · ${L('Canale', 'Channel')}: ${item.channelId}` : ''}</p><details><summary>{L('Dettagli', 'Details')}</summary>{item.dispatchError && <p>{L('Errore invio', 'Delivery error')}: {item.dispatchError}</p>}<pre>{JSON.stringify(item.details, null, 2)}</pre></details></article>)}</div>
          {!historyLoading && !history.length && <div className="notice">{L('Nessun evento trovato.', 'No events found.')}</div>}
          {historyPage < historyPages && <div className="toolbar"><button disabled={historyLoading} onClick={() => setHistoryPage((page) => page + 1)}>{historyLoading ? L('Caricamento…', 'Loading…') : L('Carica altri', 'Load more')}</button></div>}
        </>}

        {tab === 'admin' && canAdmin && <>
          <AccessBindings guildId={guildId} roles={roles} bindings={bindings} onChange={(next) => { setBindings(next); void loadPlan(); }} locale={locale} />
          {plan && <BrandingPanel guildId={guildId} plan={plan} locale={locale} onSaved={(branding) => setPlan({ ...plan, branding })} />}
          <div className="two-col">
            <section className="panel"><div className="panel-title"><div><p className="eyebrow">AUDIT</p><h2>{L('Modifiche dal pannello', 'Panel changes')}</h2></div></div><div className="admin-log">{panelLog.map((item) => <div key={item.id}><strong>{item.username}</strong><span>{item.action}</span><time>{formatDate(item.createdAt)}</time></div>)}</div></section>
            <section className="panel danger-panel"><div className="panel-title"><div><p className="eyebrow">PRIVACY</p><h2>{L('Cancellazione dati utente', 'User data deletion')}</h2></div></div><p className="muted">{L('Elimina snapshot ed eventi associati a uno specifico Discord User ID.', 'Delete snapshots and events associated with a specific Discord User ID.')}</p><PrivacyDelete guildId={guildId} locale={locale} onDone={() => setStatus(L('Dati utente eliminati.', 'User data deleted.'))} /></section>
          </div>
        </>}
      </section>
      </main>
    </div>
  );
}

type SearchOption = { value: string; label: string };

function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled
}: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const selected = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) setQuery(selected?.label ?? '');
  }, [value, selected?.label, open]);

  const normalized = query.trim().toLocaleLowerCase();
  const filtered = normalized
    ? options.filter((option) =>
        option.label.toLocaleLowerCase().includes(normalized) ||
        option.value.toLocaleLowerCase().includes(normalized) ||
        option.label.replace(/^[@#]/, '').toLocaleLowerCase().includes(normalized.replace(/^[@#]/, ''))
      )
    : options;

  const choose = (option: SearchOption) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  const reset = () => {
    setQuery(selected?.label ?? '');
    setOpen(false);
  };

  return <div className={`searchable-select ${open ? 'is-open' : ''}`}>
    <input
      type="text"
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      autoComplete="off"
      disabled={disabled}
      value={query}
      placeholder={placeholder}
      onFocus={(event) => {
        setOpen(true);
        event.currentTarget.select();
      }}
      onChange={(event) => {
        setQuery(event.target.value);
        setOpen(true);
      }}
      onBlur={() => window.setTimeout(reset, 100)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && open && filtered.length) {
          event.preventDefault();
          choose(filtered[0]!);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          reset();
          event.currentTarget.blur();
        }
      }}
    />
    {open && !disabled && <div className="searchable-select-menu" role="listbox">
      {filtered.length ? filtered.map((option) => <div
        key={option.value || '__empty__'}
        className={`searchable-select-option ${option.value === value ? 'is-selected' : ''}`}
        role="option"
        aria-selected={option.value === value}
        onMouseDown={(event) => {
          event.preventDefault();
          choose(option);
        }}
      >
        <span>{option.label}</span>
        {option.value && <small>{option.value}</small>}
      </div>) : <div className="searchable-select-empty">—</div>}
    </div>}
  </div>;
}

function Toggle({ label, description, checked, onChange, danger, disabled }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; danger?: boolean; disabled?: boolean }) {
  return <div className={`toggle-row ${danger ? 'danger-toggle' : ''}`}><div><strong>{label}</strong><span>{description}</span></div><button disabled={disabled} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><i /></button></div>;
}

function RouteEditor({ event, route, channels, roles, onSave, onSaveDebounced, readOnly, required, tier, locale }: { event: EventDefinition; route: Route | null; channels: Channel[]; roles: Role[]; onSave: (patch: Partial<Route>) => void; onSaveDebounced: (patch: Partial<Route>, key: string) => void; readOnly?: boolean; required: PlanTier; tier: PlanTier; locale: Locale }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const displayEvent = localizeEvent(event, locale);
  const premiumLocked = tierIndex(tier) < tierIndex(required);
  const planName = tierLabel(required, locale);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(route?.customTitle ?? '');
  useEffect(() => setTitle(route?.customTitle ?? ''), [route?.customTitle]);
  if (!route) return null;
  return <article className={`route-card ${route.enabled ? 'enabled' : ''}`}>
    <div className="route-head"><button disabled={readOnly || premiumLocked} title={premiumLocked ? L(`Richiede ${planName}`, `Requires ${planName}`) : L('Invio Discord', 'Discord delivery')} className={`switch ${route.enabled ? 'on' : ''}`} onClick={() => onSave({ enabled: !route.enabled })}><i /></button><div className="route-name" onClick={() => setOpen(!open)}><div><strong>{displayEvent.label}</strong>{event.noisy && <span className={`badge ${premiumLocked ? 'premium-badge' : ''}`}>{premiumLocked ? `${tierShort(required).toUpperCase()} · ${L('ALTO VOLUME', 'HIGH VOLUME')}` : L('ALTO VOLUME', 'HIGH VOLUME')}</span>}{!route.captureEnabled && <span className="badge">{L('NON ACQUISITO', 'NOT COLLECTED')}</span>}</div><span>{event.key} · {displayEvent.description}</span></div><button className="chevron" onClick={() => setOpen(!open)}>{open ? '⌃' : '⌄'}</button></div>
    {open && <div className="route-config">
      <label>{L('Canale destinazione', 'Destination channel')}<SearchableSelect
        disabled={readOnly}
        value={route.destinationChannelId ?? ''}
        onChange={(value) => onSave({ destinationChannelId: value || null })}
        placeholder={L('Cerca un canale…', 'Search channels…')}
        options={[
          { value: '', label: L('Usa predefinito', 'Use default') },
          ...channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))
        ]}
      /></label>
      <label>{L('Titolo personalizzato', 'Custom title')}<input disabled={readOnly} value={title} placeholder={displayEvent.label} onBlur={() => onSave({ customTitle: title || null })} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="inline-fields"><label>{L('Colore', 'Color')}<input disabled={readOnly} type="color" value={route.embedColor ?? '#3f3c54'} onChange={(e) => onSaveDebounced({ embedColor: e.target.value }, 'embedColor')} /></label><label>{L('Menziona ruolo', 'Mention role')}<SearchableSelect
        disabled={readOnly}
        value={route.mentionRoleIds[0] ?? ''}
        onChange={(value) => onSave({ mentionRoleIds: value ? [value] : [] })}
        placeholder={L('Cerca un ruolo…', 'Search roles…')}
        options={[
          { value: '', label: L('Nessuno', 'None') },
          ...roles.map((role) => ({ value: role.id, label: `@${role.name}` }))
        ]}
      /></label><label>{L('Retention evento', 'Event retention')}<input disabled={readOnly} type="number" min="1" defaultValue={route.retentionDays ?? ''} placeholder="Default" onBlur={(e) => onSave({ retentionDays: e.currentTarget.value ? Number(e.currentTarget.value) : null })} /></label></div>
      <div className="inline-fields"><label>{L('Footer personalizzato', 'Custom footer')}<input disabled={readOnly} defaultValue={route.customFooter ?? ''} placeholder={L('Usa footer globale', 'Use global footer')} onBlur={(e) => onSave({ customFooter: e.currentTarget.value || null })} /></label><label>{L("Testo prima dell'embed", 'Text before embed')}<input disabled={readOnly} defaultValue={route.textPrefix ?? ''} placeholder={L('Opzionale', 'Optional')} onBlur={(e) => onSave({ textPrefix: e.currentTarget.value || null })} /></label><label>Thumbnail URL<input disabled={readOnly} type="url" defaultValue={route.thumbnailUrl ?? ''} placeholder="https://..." onBlur={(e) => onSave({ thumbnailUrl: e.currentTarget.value || null })} /></label></div>
      {premiumLocked && <div className="premium-lock-note">{L(`Questo logger genera un volume elevato di eventi ed è incluso dal piano ${planName}.`, `This logger generates a high volume of events and is included from the ${planName} plan.`)} <a className="inline-link" href={`/${locale}/pricing`}>{L('Vedi i piani', 'See plans')}</a></div>}
      <div className="mini-toggles"><label><input type="checkbox" disabled={readOnly || premiumLocked} checked={route.captureEnabled} onChange={(e) => onSave({ captureEnabled: e.target.checked })} /> {L('Acquisisci nel database', 'Collect in database')}</label><label><input type="checkbox" disabled={readOnly || premiumLocked} checked={route.enabled} onChange={(e) => onSave({ enabled: e.target.checked })} /> {L('Invia su Discord', 'Send to Discord')}</label><label><input type="checkbox" disabled={readOnly} checked={route.showTimestamp} onChange={(e) => onSave({ showTimestamp: e.target.checked })} /> Timestamp</label><label><input type="checkbox" disabled={readOnly} checked={route.showActor} onChange={(e) => onSave({ showActor: e.target.checked })} /> Actor</label><label><input type="checkbox" disabled={readOnly} checked={route.showTarget} onChange={(e) => onSave({ showTarget: e.target.checked })} /> Target</label><label><input type="checkbox" disabled={readOnly} checked={route.showChannel} onChange={(e) => onSave({ showChannel: e.target.checked })} /> {L('Canale', 'Channel')}</label><label><input type="checkbox" disabled={readOnly} checked={route.includeContent} onChange={(e) => onSave({ includeContent: e.target.checked })} /> {L('Contenuto nell’embed', 'Content in embed')}</label><label><input type="checkbox" disabled={readOnly} checked={route.includeAttachments} onChange={(e) => onSave({ includeAttachments: e.target.checked })} /> {L('Allegati nell’embed', 'Attachments in embed')}</label><label><input type="checkbox" disabled={readOnly} checked={route.ignoreBots} onChange={(e) => onSave({ ignoreBots: e.target.checked })} /> {L('Ignora bot', 'Ignore bots')}</label></div>
      <div className="ignore-fields">
        <ManualIdList
          disabled={readOnly}
          label={L('Ignora utenti', 'Ignore users')}
          placeholder={L('Discord User ID…', 'Discord User ID…')}
          values={route.ignoredUserIds}
          onSave={(values) => onSave({ ignoredUserIds: values })}
          locale={locale}
        />
        <SearchableMultiSelect
          disabled={readOnly}
          label={L('Ignora ruoli', 'Ignore roles')}
          placeholder={L('Cerca un ruolo…', 'Search roles…')}
          values={route.ignoredRoleIds}
          options={roles.map((role) => ({ value: role.id, label: `@${role.name}` }))}
          onSave={(values) => onSave({ ignoredRoleIds: values })}
          locale={locale}
        />
        <SearchableMultiSelect
          disabled={readOnly}
          label={L('Ignora canali', 'Ignore channels')}
          placeholder={L('Cerca un canale…', 'Search channels…')}
          values={route.ignoredChannelIds}
          options={channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))}
          onSave={(values) => onSave({ ignoredChannelIds: values })}
          locale={locale}
        />
      </div>
      <div className="embed-preview" style={{ borderLeftColor: route.embedColor ?? '#3f3c54' }}><small>{L('ANTEPRIMA EMBED', 'EMBED PREVIEW')}</small><strong>{title || displayEvent.label}</strong><span>{displayEvent.description}</span>{route.showActor && <em>{L('Autore azione · @utente', 'Action author · @user')}</em>}{route.showChannel && <em>{L('Canale · #canale', 'Channel · #channel')}</em>}<small>{route.customFooter || L('Footer globale', 'Global footer')}{route.showTimestamp ? ' · timestamp' : ''}</small></div>
    </div>}
  </article>;
}

function ManualIdList({
  label,
  placeholder,
  values,
  onSave,
  disabled,
  locale
}: {
  label: string;
  placeholder: string;
  values: string[];
  onSave: (values: string[]) => void;
  disabled?: boolean;
  locale: Locale;
}) {
  const [input, setInput] = useState('');
  const L = (it: string, en: string) => locale === 'it' ? it : en;

  const add = () => {
    const candidates = input
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => /^\d{17,20}$/.test(value));

    if (!candidates.length) return;
    const next = [...new Set([...values, ...candidates])];
    onSave(next);
    setInput('');
  };

  const remove = (value: string) => onSave(values.filter((item) => item !== value));

  return <div className="multi-filter-field">
    <span className="multi-filter-label">{label}</span>
    <div className="multi-filter-entry">
      <input
        disabled={disabled}
        value={input}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add();
          }
        }}
      />
      <button type="button" disabled={disabled || !input.trim()} onClick={add} aria-label={L('Aggiungi', 'Add')}>+</button>
    </div>
    <div className="multi-filter-list">
      {values.map((value) => <div className="multi-filter-chip" key={value}>
        <span><code>{value}</code></span>
        <button type="button" disabled={disabled} onClick={() => remove(value)} aria-label={L('Rimuovi', 'Remove')}>×</button>
      </div>)}
    </div>
  </div>;
}

function SearchableMultiSelect({
  label,
  placeholder,
  values,
  options,
  onSave,
  disabled,
  locale
}: {
  label: string;
  placeholder: string;
  values: string[];
  options: SearchOption[];
  onSave: (values: string[]) => void;
  disabled?: boolean;
  locale: Locale;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const L = (it: string, en: string) => locale === 'it' ? it : en;

  const available = options.filter((option) => !values.includes(option.value));
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = (normalized
    ? available.filter((option) =>
        option.label.toLocaleLowerCase().includes(normalized) ||
        option.value.toLocaleLowerCase().includes(normalized) ||
        option.label.replace(/^[@#]/, '').toLocaleLowerCase().includes(normalized.replace(/^[@#]/, ''))
      )
    : available
  ).slice(0, 100);

  const add = (option?: SearchOption) => {
    const selected = option ?? filtered[0];
    if (!selected || values.includes(selected.value)) return;
    onSave([...values, selected.value]);
    setQuery('');
    setOpen(false);
  };

  const remove = (value: string) => onSave(values.filter((item) => item !== value));

  return <div className="multi-filter-field">
    <span className="multi-filter-label">{label}</span>
    <div className={`multi-filter-search ${open ? 'is-open' : ''}`}>
      <div className="multi-filter-entry">
        <input
          disabled={disabled}
          value={query}
          autoComplete="off"
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 100)}
        />
        <button type="button" disabled={disabled || !filtered.length} onClick={() => add()} aria-label={L('Aggiungi', 'Add')}>+</button>
      </div>
      {open && !disabled && <div className="multi-filter-menu" role="listbox">
        {filtered.length ? filtered.map((option) => <div
          key={option.value}
          className="multi-filter-option"
          role="option"
          aria-selected="false"
          onMouseDown={(event) => {
            event.preventDefault();
            add(option);
          }}
        >
          <span>{option.label}</span>
          <small>{option.value}</small>
        </div>) : <div className="searchable-select-empty">{L('Nessun risultato', 'No results')}</div>}
      </div>}
    </div>
    <div className="multi-filter-list">
      {values.map((value) => {
        const option = options.find((item) => item.value === value);
        return <div className="multi-filter-chip" key={value}>
          <span>{option?.label ?? value}{option && <small>{value}</small>}</span>
          <button type="button" disabled={disabled} onClick={() => remove(value)} aria-label={L('Rimuovi', 'Remove')}>×</button>
        </div>;
      })}
    </div>
  </div>;
}

function AccessBindings({ guildId, roles, bindings, onChange, locale }: { guildId: string; roles: Role[]; bindings: AccessBinding[]; onChange: (bindings: AccessBinding[]) => void; locale: Locale }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const [roleId, setRoleId] = useState('');
  const [level, setLevel] = useState<'VIEWER' | 'MODERATOR' | 'ADMIN'>('VIEWER');
  const [error, setError] = useState('');
  const save = async () => {
    if (!roleId) return;
    setError('');
    try {
      const binding = await api<AccessBinding>(`/backend/api/guilds/${guildId}/access-bindings/${roleId}`, { method: 'PUT', body: JSON.stringify({ accessLevel: level }) });
      onChange([...bindings.filter((x) => x.discordRoleId !== roleId), binding]);
      setRoleId('');
    } catch (cause) {
      setError(errorMessage(cause, locale));
    }
  };
  const remove = async (id: string) => {
    setError('');
    try {
      await api(`/backend/api/guilds/${guildId}/access-bindings/${id}`, { method: 'DELETE' });
      onChange(bindings.filter((x) => x.discordRoleId !== id));
    } catch (cause) {
      setError(errorMessage(cause, locale));
    }
  };
  return <section className="panel access-panel"><div className="panel-title"><div><p className="eyebrow">{L('PERMESSI', 'PERMISSIONS')}</p><h2>{L('Accesso tramite ruoli Discord', 'Access through Discord roles')}</h2></div></div>{error && <div className="notice">{error}</div>}<div className="access-add"><SearchableSelect value={roleId} onChange={setRoleId} placeholder={L('Cerca un ruolo…', 'Search roles…')} options={roles.filter((role) => role.name !== '@everyone').map((role) => ({ value: role.id, label: `@${role.name}` }))} /><select value={level} onChange={(e) => setLevel(e.target.value as 'VIEWER' | 'MODERATOR' | 'ADMIN')}><option value="VIEWER">Viewer</option><option value="MODERATOR">Moderator</option><option value="ADMIN">Admin</option></select><button onClick={save}>{L('Aggiungi', 'Add')}</button></div><div className="binding-list">{bindings.map((b) => { const role = roles.find((r) => r.id === b.discordRoleId); return <div key={b.id}><span>@{role?.name ?? b.discordRoleId}</span><strong>{b.accessLevel}</strong><button onClick={() => remove(b.discordRoleId)}>{L('Rimuovi', 'Remove')}</button></div>; })}</div></section>;
}

function PrivacyDelete({ guildId, onDone, locale }: { guildId: string; onDone: () => void; locale: Locale }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    const id = userId.trim();
    if (!/^\d{17,20}$/.test(id)) {
      setError(L('Inserisci un Discord User ID valido (17-20 cifre).', 'Enter a valid Discord User ID (17-20 digits).'));
      return;
    }
    if (!confirm(locale === 'it' ? `Eliminare i dati salvati per ${id}?` : `Delete stored data for ${id}?`)) return;
    setError('');
    try {
      await api(`/backend/api/guilds/${guildId}/privacy/user/${id}`, { method: 'DELETE' });
      setUserId(''); onDone();
    } catch (cause) {
      setError(errorMessage(cause, locale));
    }
  };
  return <>{error && <div className="notice">{error}</div>}<div className="danger-action"><input placeholder="Discord User ID" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value)} /><button onClick={submit}>{L('Elimina dati', 'Delete data')}</button></div></>;
}

function PlanPanel({ plan, locale }: { plan: PlanInfo; locale: Locale }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const limits = plan.plan.limits;
  const labels = limitLabels(locale);
  const expired = plan.tier !== plan.effectiveTier;
  const meters = [
    { key: 'eventsPerDay' as const, used: plan.usage.eventsToday, max: limits.eventsPerDay, label: L('Eventi registrati oggi (UTC)', 'Events stored today (UTC)') },
    { key: 'logChannels' as const, used: plan.usage.logChannels, max: limits.logChannels, label: labels.logChannels },
    { key: 'roleBindings' as const, used: plan.usage.roleBindings, max: limits.roleBindings, label: labels.roleBindings }
  ];
  return (
    <section className="panel plan-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">{L('PIANO', 'PLAN')}</p>
          <h2>{tierLabel(plan.effectiveTier, locale)}</h2>
        </div>
        <a className="button button-sm button-secondary" href={`/${locale}/pricing`}>{L('Vedi i piani', 'See plans')}</a>
      </div>
      <p className="muted">
        {expired
          ? L(`Il piano ${tierLabel(plan.tier, locale)} è scaduto: valgono i limiti Free.`, `The ${tierLabel(plan.tier, locale)} plan has expired: Free limits apply.`)
          : plan.expiresAt
            ? L(`Valido fino al ${new Date(plan.expiresAt).toLocaleDateString('it-IT')}.`, `Valid until ${new Date(plan.expiresAt).toLocaleDateString('en-GB')}.`)
            : plan.effectiveTier === 'FREE'
              ? L('Piano gratuito. Per sbloccare i logger ad alto volume e alzare i limiti contattami dalla pagina prezzi.', 'Free plan. To unlock high-volume loggers and raise limits, contact me from the pricing page.')
              : L('Piano attivo, senza scadenza.', 'Active plan, no expiry.')}
      </p>
      <div className="plan-meters">
        {meters.map((meter) => {
          const ratio = Math.min(1, meter.used / Math.max(1, meter.max));
          return (
            <div className={`plan-meter ${ratio >= 1 ? 'is-full' : ratio >= 0.8 ? 'is-high' : ''}`} key={meter.key}>
              <div><span>{meter.label}</span><strong className="mono">{formatNumber(meter.used, locale)} / {formatNumber(meter.max, locale)}</strong></div>
              <i><b style={{ width: `${Math.max(2, ratio * 100)}%` }} /></i>
            </div>
          );
        })}
      </div>
      <dl className="plan-limits">
        {(['retentionDays', 'filterEntries', 'mentionRoles', 'exportEvents'] as const).map((key) => (
          <div key={key}><dt>{labels[key]}</dt><dd className="mono">{formatLimit(key, limits[key], locale)}</dd></div>
        ))}
      </dl>
    </section>
  );
}

const BANNER_WIDTH = 600;
const BANNER_HEIGHT = 240;
// The edge proxy accepts request bodies up to 64 KB: the encoded banner must
// fit with room to spare for the JSON wrapper.
const BANNER_MAX_CHARS = 60_000;

async function encodeBanner(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  // Cover: fill the 5:2 frame and crop the overflow from the centre.
  const scale = Math.max(BANNER_WIDTH / bitmap.width, BANNER_HEIGHT / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (BANNER_WIDTH - width) / 2, (BANNER_HEIGHT - height) / 2, width, height);
  bitmap.close();
  for (const quality of [0.86, 0.78, 0.7, 0.6, 0.5, 0.4]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= BANNER_MAX_CHARS) return data;
  }
  throw new Error('BANNER_TOO_LARGE');
}

function BrandingPanel({ guildId, plan, locale, onSaved }: { guildId: string; plan: PlanInfo; locale: Locale; onSaved: (branding: PlanInfo['branding']) => void }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const allowed = plan.plan.customBranding;
  const [nickname, setNickname] = useState(plan.branding.nickname ?? '');
  const [banner, setBanner] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (body: { nickname?: string | null; banner?: string | null }) => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await api<{ nickname: string | null; bannerSet: boolean }>(`/backend/api/guilds/${guildId}/branding`, { method: 'PUT', body: JSON.stringify(body) });
      onSaved({ nickname: saved.nickname, bannerSet: saved.bannerSet });
      setBanner(null);
      setMessage({ kind: 'ok', text: L('Profilo del bot aggiornato.', 'Bot profile updated.') });
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error, locale) });
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setBanner(await encodeBanner(file));
      setMessage(null);
    } catch {
      setMessage({ kind: 'error', text: L('Immagine non valida o troppo complessa.', 'Invalid or overly complex image.') });
    }
  };

  return (
    <section className="panel branding-panel">
      <div className="panel-title"><div><p className="eyebrow">BRAND</p><h2>{L('Nome e banner del bot', 'Bot name and banner')}</h2></div><span className="tag tag-premium">{tierLabel('TIER3', locale)}</span></div>
      {!allowed && <p className="muted">{L('Con il Livello 3 · Brand puoi dare a Sentinel un nome e un banner personalizzati, visibili solo in questo server.', 'With Level 3 · Brand you can give Sentinel a custom name and banner, visible only in this server.')} <a className="inline-link" href={`/${locale}/pricing`}>{L('Vedi i piani', 'See plans')}</a></p>}
      {allowed && <>
        <p className="muted">{L('Visibili solo in questo server. Il bot deve avere il permesso “Cambia nickname”. Il banner viene ritagliato a 600×240.', 'Visible only in this server. The bot needs the “Change Nickname” permission. The banner is cropped to 600×240.')}</p>
        {message && <div className={`notice ${message.kind === 'error' ? 'notice-error' : 'notice-ok'}`}>{message.text}</div>}
        <div className="branding-grid">
          <div>
            <label>{L('Nome nel server', 'Name in this server')}<input value={nickname} maxLength={32} onChange={(e) => setNickname(e.target.value)} placeholder="Sentinel" /></label>
            <div className="button-row">
              <button className="button button-primary button-sm" disabled={busy || !nickname.trim()} onClick={() => send({ nickname: nickname.trim() })}>{L('Salva nome', 'Save name')}</button>
              <button className="button button-ghost button-sm" disabled={busy || !plan.branding.nickname} onClick={() => { setNickname(''); void send({ nickname: null }); }}>{L('Ripristina', 'Reset')}</button>
            </div>
          </div>
          <div>
            <label>{L('Banner', 'Banner')}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => void pick(e.target.files?.[0])} /></label>
            {banner && <img className="banner-preview" src={banner} alt="" />}
            <div className="button-row">
              <button className="button button-primary button-sm" disabled={busy || !banner} onClick={() => send({ banner })}>{L('Carica banner', 'Upload banner')}</button>
              <button className="button button-ghost button-sm" disabled={busy || !plan.branding.bannerSet} onClick={() => void send({ banner: null })}>{L('Rimuovi banner', 'Remove banner')}</button>
            </div>
            {plan.branding.bannerSet && !banner && <small className="field-help">{L('Un banner personalizzato è attivo.', 'A custom banner is active.')}</small>}
          </div>
        </div>
      </>}
    </section>
  );
}
