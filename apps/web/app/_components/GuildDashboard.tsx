'use client';

import { useEffect, useMemo, useState } from 'react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { localizeCategory, localizeEvent, type Locale } from '../i18n';

type Settings = {
  guildId: string;
  guildName: string;
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

const textChannelTypes = new Set([0, 5]);

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
    description: 'Stato del bot, warning, errori e diagnostica Gateway avanzata.',
    categories: ['Sistema', 'Avanzato']
  }
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
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
      system: { label: 'System & advanced', description: 'Bot status, warnings, errors and advanced Gateway diagnostics.' },
      other: { label: 'Other loggers', description: 'Events not yet assigned to a macro category.' }
    };
    return english[macro.key] ?? { label: macro.label, description: macro.description };
  };
  const [tab, setTab] = useState<'overview' | 'events' | 'history' | 'admin'>('overview');
  const [settings, setSettings] = useState<Settings | null>(null);
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
  const [status, setStatus] = useState('');

  const load = async () => {
    const [s, r, resources, st, ac] = await Promise.all([
      api<Settings>(`/backend/api/guilds/${guildId}/settings`),
      api<RouteRow[]>(`/backend/api/guilds/${guildId}/routes`),
      api<{ channels: Channel[]; roles: Role[] }>(`/backend/api/guilds/${guildId}/resources`),
      api<Stats>(`/backend/api/guilds/${guildId}/stats`),
      api<{ access: AccessLevel }>(`/backend/api/guilds/${guildId}/access`)
    ]);
    setSettings(s); setRoutes(r); setChannels(resources.channels); setRoles(resources.roles); setStats(st); setAccess(ac.access);
  };

  useEffect(() => { load().catch(() => setStatus(L('Errore durante il caricamento.', 'Error while loading.'))); }, [guildId, locale]);

  useEffect(() => {
    if (tab !== 'history') return;
    const qs = new URLSearchParams({ take: '100' });
    if (historyEvent) qs.set('eventKey', historyEvent);
    if (historyText) qs.set('q', historyText);
    api<{ items: LogItem[] }>(`/backend/api/guilds/${guildId}/events?${qs}`).then((x) => setHistory(x.items)).catch(() => setStatus(L('Impossibile caricare lo storico.', 'Unable to load history.')));
  }, [tab, guildId, historyEvent, historyText]);

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
  }, [routes, filter]);
  const textChannels = channels.filter((c) => textChannelTypes.has(c.type));
  const canAdmin = access === 'ADMIN' || access === 'OWNER';
  const canModerate = canAdmin || access === 'MODERATOR';
  const formatDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'it-IT', { dateStyle: 'short', timeStyle: 'medium', timeZone: settings?.timezone || 'Europe/Rome' }).format(new Date(value));
    } catch {
      return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'it-IT');
    }
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await api(`/backend/api/guilds/${guildId}/settings`, { method: 'PUT', body: JSON.stringify(patch) });
    setStatus(L('Impostazioni salvate.', 'Settings saved.'));
    setTimeout(() => setStatus(''), 1800);
  };

  const saveRoute = async (eventKey: string, patch: Partial<Route>) => {
    setRoutes((current) => current.map((row) => row.event.key === eventKey ? { ...row, route: { ...(row.route as Route), eventKey, ...patch } } : row));
    await api(`/backend/api/guilds/${guildId}/routes/${encodeURIComponent(eventKey)}`, { method: 'PUT', body: JSON.stringify(patch) });
    setStatus(L('Logger aggiornato.', 'Logger updated.'));
    setTimeout(() => setStatus(''), 1400);
  };

  const bulk = async (enabled: boolean, includeNoisy = false) => {
    await api(`/backend/api/guilds/${guildId}/routes/bulk`, { method: 'POST', body: JSON.stringify({ enabled, includeNoisy }) });
    await load();
  };

  if (!settings) return <main className="loading">{L('Caricamento pannello…', 'Loading dashboard…')}</main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left"><a className="back" href={`/${locale}/dashboard`}>←</a><div><p className="eyebrow">SERVER</p><h1>{settings.guildName}</h1></div></div>
        <div className="topbar-actions">
          <LanguageSwitcher locale={locale} itHref={`/it/dashboard/${guildId}`} enHref={`/en/dashboard/${guildId}`} compact />
          <div className="status-pill"><span className="status-dot" /> {L('Audit attivo', 'Audit active')}</div>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>{L('Panoramica', 'Overview')}</button>
        <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>Logger</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>{L('Storico', 'History')}</button>
        {canAdmin && <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>{L('Amministrazione', 'Administration')}</button>}
      </nav>

      {status && <div className="toast">{status}</div>}

      <section className="content">
        {!canAdmin && <div className="notice">{L('Accesso pannello:', 'Panel access:')} <strong>{access}</strong>. {L('Le impostazioni sono in sola lettura.', 'Settings are read-only.')}</div>}
        {tab === 'overview' && <>
          <div className="stat-grid">
            <div className="stat-card"><span>{L('Eventi oggi', 'Events today')}</span><strong>{stats?.today ?? 0}</strong></div>
            <div className="stat-card"><span>{L('Ultime 24 ore', 'Last 24 hours')}</span><strong>{stats?.last24h ?? 0}</strong></div>
            <div className="stat-card"><span>{L('Snapshot messaggi', 'Message snapshots')}</span><strong>{stats?.snapshots ?? 0}</strong></div>
            <div className="stat-card"><span>Retention</span><strong>{settings.defaultRetentionDays}g</strong></div>
            <div className="stat-card"><span>{L('Problemi invio 24h', 'Delivery issues 24h')}</span><strong>{stats?.deliveryIssues ?? 0}</strong></div>
          </div>

          <div className="two-col">
            <section className="panel">
              <div className="panel-title"><div><p className="eyebrow">{L('DESTINAZIONE', 'DESTINATION')}</p><h2>{L('Impostazioni generali', 'General settings')}</h2></div></div>
              <label>{L('Canale log predefinito', 'Default log channel')}<select disabled={!canAdmin} value={settings.defaultLogChannelId ?? ''} onChange={(e) => saveSettings({ defaultLogChannelId: e.target.value || null })}><option value="">Nessuno</option>{textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select></label>
              <label>{L('Retention dati', 'Data retention')}<input disabled={!canAdmin} type="number" min="1" max="3650" value={settings.defaultRetentionDays} onChange={(e) => saveSettings({ defaultRetentionDays: Number(e.target.value) })} /></label>
              <div className="inline-fields"><label>{L('Fuso orario', 'Timezone')}<input disabled={!canAdmin} value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} onBlur={() => saveSettings({ timezone: settings.timezone })} /></label><label>Locale<input disabled={!canAdmin} value={settings.locale} onChange={(e) => setSettings({ ...settings, locale: e.target.value })} onBlur={() => saveSettings({ locale: settings.locale })} /></label></div>
              <div className="inline-fields"><label>{L('Colore embed', 'Embed color')}<input disabled={!canAdmin} type="color" value={settings.embedColor} onChange={(e) => saveSettings({ embedColor: e.target.value })} /></label><label>Footer<input disabled={!canAdmin} value={settings.embedFooter} onChange={(e) => setSettings({ ...settings, embedFooter: e.target.value })} onBlur={() => saveSettings({ embedFooter: settings.embedFooter })} /></label></div>
            </section>

            <section className="panel">
              <div className="panel-title"><div><p className="eyebrow">{L('DATI', 'DATA')}</p><h2>{L('Acquisizione', 'Collection')}</h2></div></div>
              <Toggle disabled={!canAdmin} label={L('Snapshot messaggi', 'Message snapshots')} description={L('Conserva una copia per ricostruire i messaggi eliminati.', 'Keep a copy to reconstruct deleted messages.')} checked={settings.messageSnapshotEnabled} onChange={(value) => saveSettings({ messageSnapshotEnabled: value })} />
              <Toggle disabled={!canAdmin} label={L('Contenuto messaggi', 'Message content')} description={L('Salva testo ed embed negli snapshot.', 'Store text and embeds in snapshots.')} checked={settings.storeMessageContent} onChange={(value) => saveSettings({ storeMessageContent: value })} />
              <Toggle disabled={!canAdmin} label={L('Presenze', 'Presence')} description={L('Status e attività. Può generare molti eventi.', 'Status and activity. This can generate many events.')} checked={settings.presenceLoggingEnabled} onChange={(value) => saveSettings({ presenceLoggingEnabled: value })} />
              <Toggle disabled={!canAdmin} label="Typing" description={L('Registra quando un utente inizia a scrivere.', 'Record when a user starts typing.')} checked={settings.typingLoggingEnabled} onChange={(value) => saveSettings({ typingLoggingEnabled: value })} />
              <Toggle disabled={!canAdmin} label="Gateway raw" description={L('Debug avanzato: salva eventi Gateway grezzi.', 'Advanced debug: store raw Gateway events.')} checked={settings.rawGatewayEnabled} onChange={(value) => saveSettings({ rawGatewayEnabled: value })} danger />
            </section>
          </div>

          <section className="panel">
            <div className="panel-title"><div><p className="eyebrow">{L('VOLUME', 'VOLUME')}</p><h2>{L('Eventi nelle ultime 24 ore', 'Events in the last 24 hours')}</h2></div></div>
            <div className="bars">{stats?.groups.map((g) => <div className="bar-row" key={g.eventKey}><span>{g.eventKey}</span><div><i style={{ width: `${Math.max(3, Math.min(100, g.count / Math.max(...stats.groups.map(x => x.count), 1) * 100))}%` }} /></div><b>{g.count}</b></div>)}</div>
          </section>
        </>}

        {tab === 'events' && <>
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
                        {categoryRows.map(({ event, route }) => <RouteEditor key={event.key} event={event} route={route} channels={textChannels} roles={roles} onSave={(patch) => saveRoute(event.key, patch)} readOnly={!canAdmin} locale={locale} />)}
                      </div>
                    </section>;
                  })}
                </div>}
              </section>;
            })}
          </div>
        </>}

        {tab === 'history' && <>
          <div className="toolbar"><input placeholder={L('Cerca nel riepilogo…', 'Search summaries…')} value={historyText} onChange={(e) => setHistoryText(e.target.value)} /><select value={historyEvent} onChange={(e) => setHistoryEvent(e.target.value)}><option value="">{L('Tutti gli eventi', 'All events')}</option>{routes.map(({ event }) => <option key={event.key} value={event.key}>{localizeEvent(event, locale).label}</option>)}</select>{canModerate && <a className="button-link" href={`/backend/api/guilds/${guildId}/export`}>{L('Esporta JSON', 'Export JSON')}</a>}</div>
          <div className="history-list">{history.map((item) => <article key={item.id} className="history-item"><div><span className="event-key">{item.eventKey} · {item.dispatchState}</span><time>{formatDate(item.createdAt)}</time></div><strong>{item.summary}</strong><p>{item.actorId ? `Actor: ${item.actorId}` : ''}{item.channelId ? ` · ${L('Canale', 'Channel')}: ${item.channelId}` : ''}</p><details><summary>{L('Dettagli', 'Details')}</summary>{item.dispatchError && <p>Errore invio: {item.dispatchError}</p>}<pre>{JSON.stringify(item.details, null, 2)}</pre></details></article>)}</div>
        </>}

        {tab === 'admin' && canAdmin && <>
          <AccessBindings guildId={guildId} roles={roles} bindings={bindings} onChange={setBindings} locale={locale} />
          <div className="two-col">
            <section className="panel"><div className="panel-title"><div><p className="eyebrow">AUDIT</p><h2>{L('Modifiche dal pannello', 'Panel changes')}</h2></div></div><div className="admin-log">{panelLog.map((item) => <div key={item.id}><strong>{item.username}</strong><span>{item.action}</span><time>{formatDate(item.createdAt)}</time></div>)}</div></section>
            <section className="panel danger-panel"><div className="panel-title"><div><p className="eyebrow">PRIVACY</p><h2>{L('Cancellazione dati utente', 'User data deletion')}</h2></div></div><p className="muted">{L('Elimina snapshot ed eventi associati a uno specifico Discord User ID.', 'Delete snapshots and events associated with a specific Discord User ID.')}</p><PrivacyDelete guildId={guildId} locale={locale} onDone={() => setStatus(L('Dati utente eliminati.', 'User data deleted.'))} /></section>
          </div>
        </>}
      </section>
    </main>
  );
}

function Toggle({ label, description, checked, onChange, danger, disabled }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; danger?: boolean; disabled?: boolean }) {
  return <div className={`toggle-row ${danger ? 'danger-toggle' : ''}`}><div><strong>{label}</strong><span>{description}</span></div><button disabled={disabled} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><i /></button></div>;
}

function RouteEditor({ event, route, channels, roles, onSave, readOnly, locale }: { event: EventDefinition; route: Route | null; channels: Channel[]; roles: Role[]; onSave: (patch: Partial<Route>) => void; readOnly?: boolean; locale: Locale }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const displayEvent = localizeEvent(event, locale);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(route?.customTitle ?? '');
  useEffect(() => setTitle(route?.customTitle ?? ''), [route?.customTitle]);
  if (!route) return null;
  return <article className={`route-card ${route.enabled ? 'enabled' : ''}`}>
    <div className="route-head"><button disabled={readOnly} title={L('Invio Discord', 'Discord delivery')} className={`switch ${route.enabled ? 'on' : ''}`} onClick={() => onSave({ enabled: !route.enabled })}><i /></button><div className="route-name" onClick={() => setOpen(!open)}><div><strong>{displayEvent.label}</strong>{event.noisy && <span className="badge">{L('ALTO VOLUME', 'HIGH VOLUME')}</span>}{!route.captureEnabled && <span className="badge">{L('NON ACQUISITO', 'NOT COLLECTED')}</span>}</div><span>{event.key} · {displayEvent.description}</span></div><button className="chevron" onClick={() => setOpen(!open)}>{open ? '⌃' : '⌄'}</button></div>
    {open && <div className="route-config">
      <label>{L('Canale destinazione', 'Destination channel')}<select disabled={readOnly} value={route.destinationChannelId ?? ''} onChange={(e) => onSave({ destinationChannelId: e.target.value || null })}><option value="">{L('Usa predefinito', 'Use default')}</option>{channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select></label>
      <label>{L('Titolo personalizzato', 'Custom title')}<input disabled={readOnly} value={title} placeholder={displayEvent.label} onBlur={() => onSave({ customTitle: title || null })} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="inline-fields"><label>{L('Colore', 'Color')}<input disabled={readOnly} type="color" value={route.embedColor ?? '#3f3c54'} onChange={(e) => onSave({ embedColor: e.target.value })} /></label><label>{L('Menziona ruolo', 'Mention role')}<select disabled={readOnly} value={route.mentionRoleIds[0] ?? ''} onChange={(e) => onSave({ mentionRoleIds: e.target.value ? [e.target.value] : [] })}><option value="">{L('Nessuno', 'None')}</option>{roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</select></label><label>{L('Retention evento', 'Event retention')}<input disabled={readOnly} type="number" min="1" max="3650" defaultValue={route.retentionDays ?? ''} placeholder="Default" onBlur={(e) => onSave({ retentionDays: e.currentTarget.value ? Number(e.currentTarget.value) : null })} /></label></div>
      <div className="inline-fields"><label>{L('Footer personalizzato', 'Custom footer')}<input disabled={readOnly} defaultValue={route.customFooter ?? ''} placeholder={L('Usa footer globale', 'Use global footer')} onBlur={(e) => onSave({ customFooter: e.currentTarget.value || null })} /></label><label>{L("Testo prima dell'embed", 'Text before embed')}<input disabled={readOnly} defaultValue={route.textPrefix ?? ''} placeholder={L('Opzionale', 'Optional')} onBlur={(e) => onSave({ textPrefix: e.currentTarget.value || null })} /></label><label>Thumbnail URL<input disabled={readOnly} type="url" defaultValue={route.thumbnailUrl ?? ''} placeholder="https://..." onBlur={(e) => onSave({ thumbnailUrl: e.currentTarget.value || null })} /></label></div>
      <div className="mini-toggles"><label><input type="checkbox" disabled={readOnly} checked={route.captureEnabled} onChange={(e) => onSave({ captureEnabled: e.target.checked })} /> {L('Acquisisci nel database', 'Collect in database')}</label><label><input type="checkbox" disabled={readOnly} checked={route.enabled} onChange={(e) => onSave({ enabled: e.target.checked })} /> {L('Invia su Discord', 'Send to Discord')}</label><label><input type="checkbox" disabled={readOnly} checked={route.showTimestamp} onChange={(e) => onSave({ showTimestamp: e.target.checked })} /> Timestamp</label><label><input type="checkbox" disabled={readOnly} checked={route.showActor} onChange={(e) => onSave({ showActor: e.target.checked })} /> Actor</label><label><input type="checkbox" disabled={readOnly} checked={route.showTarget} onChange={(e) => onSave({ showTarget: e.target.checked })} /> Target</label><label><input type="checkbox" disabled={readOnly} checked={route.showChannel} onChange={(e) => onSave({ showChannel: e.target.checked })} /> {L('Canale', 'Channel')}</label><label><input type="checkbox" disabled={readOnly} checked={route.includeContent} onChange={(e) => onSave({ includeContent: e.target.checked })} /> {L('Contenuto nell’embed', 'Content in embed')}</label><label><input type="checkbox" disabled={readOnly} checked={route.includeAttachments} onChange={(e) => onSave({ includeAttachments: e.target.checked })} /> {L('Allegati nell’embed', 'Attachments in embed')}</label><label><input type="checkbox" disabled={readOnly} checked={route.ignoreBots} onChange={(e) => onSave({ ignoreBots: e.target.checked })} /> {L('Ignora bot', 'Ignore bots')}</label></div>
      <div className="inline-fields"><CsvField disabled={readOnly} label={L('Ignora User ID', 'Ignore User ID')} values={route.ignoredUserIds} onSave={(v) => onSave({ ignoredUserIds: v })} /><CsvField disabled={readOnly} label={L('Ignora Role ID', 'Ignore Role ID')} values={route.ignoredRoleIds} onSave={(v) => onSave({ ignoredRoleIds: v })} /><CsvField disabled={readOnly} label={L('Ignora Channel ID', 'Ignore Channel ID')} values={route.ignoredChannelIds} onSave={(v) => onSave({ ignoredChannelIds: v })} /></div>
      <div className="embed-preview" style={{ borderLeftColor: route.embedColor ?? '#3f3c54' }}><small>{L('ANTEPRIMA EMBED', 'EMBED PREVIEW')}</small><strong>{title || displayEvent.label}</strong><span>{displayEvent.description}</span>{route.showActor && <em>{L('Autore azione · @utente', 'Action author · @user')}</em>}{route.showChannel && <em>{L('Canale · #canale', 'Channel · #channel')}</em>}<small>{route.customFooter || L('Footer globale', 'Global footer')}{route.showTimestamp ? ' · timestamp' : ''}</small></div>
    </div>}
  </article>;
}

function CsvField({ label, values, onSave, disabled }: { label: string; values: string[]; onSave: (values: string[]) => void; disabled?: boolean }) {
  const [value, setValue] = useState(values.join(', '));
  return <label>{label}<input disabled={disabled} value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => onSave(value.split(',').map((x) => x.trim()).filter(Boolean))} /></label>;
}

function AccessBindings({ guildId, roles, bindings, onChange, locale }: { guildId: string; roles: Role[]; bindings: AccessBinding[]; onChange: (bindings: AccessBinding[]) => void; locale: Locale }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const [roleId, setRoleId] = useState('');
  const [level, setLevel] = useState<'VIEWER' | 'MODERATOR' | 'ADMIN'>('VIEWER');
  const save = async () => {
    if (!roleId) return;
    const binding = await api<AccessBinding>(`/backend/api/guilds/${guildId}/access-bindings/${roleId}`, { method: 'PUT', body: JSON.stringify({ accessLevel: level }) });
    onChange([...bindings.filter((x) => x.discordRoleId !== roleId), binding]);
    setRoleId('');
  };
  const remove = async (id: string) => {
    await api(`/backend/api/guilds/${guildId}/access-bindings/${id}`, { method: 'DELETE' });
    onChange(bindings.filter((x) => x.discordRoleId !== id));
  };
  return <section className="panel access-panel"><div className="panel-title"><div><p className="eyebrow">{L('PERMESSI', 'PERMISSIONS')}</p><h2>{L('Accesso tramite ruoli Discord', 'Access through Discord roles')}</h2></div></div><div className="access-add"><select value={roleId} onChange={(e) => setRoleId(e.target.value)}><option value="">{L('Seleziona ruolo…', 'Select role…')}</option>{roles.filter((r) => r.name !== '@everyone').map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</select><select value={level} onChange={(e) => setLevel(e.target.value as 'VIEWER' | 'MODERATOR' | 'ADMIN')}><option value="VIEWER">Viewer</option><option value="MODERATOR">Moderator</option><option value="ADMIN">Admin</option></select><button onClick={save}>{L('Aggiungi', 'Add')}</button></div><div className="binding-list">{bindings.map((b) => { const role = roles.find((r) => r.id === b.discordRoleId); return <div key={b.id}><span>@{role?.name ?? b.discordRoleId}</span><strong>{b.accessLevel}</strong><button onClick={() => remove(b.discordRoleId)}>{L('Rimuovi', 'Remove')}</button></div>; })}</div></section>;
}

function PrivacyDelete({ guildId, onDone, locale }: { guildId: string; onDone: () => void; locale: Locale }) {
  const L = (it: string, en: string) => locale === 'it' ? it : en;
  const [userId, setUserId] = useState('');
  const submit = async () => {
    if (!/^\d{15,22}$/.test(userId)) return;
    if (!confirm(locale === 'it' ? `Eliminare i dati salvati per ${userId}?` : `Delete stored data for ${userId}?`)) return;
    await api(`/backend/api/guilds/${guildId}/privacy/user/${userId}`, { method: 'DELETE' });
    setUserId(''); onDone();
  };
  return <div className="danger-action"><input placeholder="Discord User ID" value={userId} onChange={(e) => setUserId(e.target.value)} /><button onClick={submit}>{L('Elimina dati', 'Delete data')}</button></div>;
}
