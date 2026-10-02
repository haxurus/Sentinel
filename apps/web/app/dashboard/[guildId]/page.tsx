'use client';

import { use, useEffect, useMemo, useState } from 'react';

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

const textChannelTypes = new Set([0, 5]);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export default function GuildDashboard({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);
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
  const [category, setCategory] = useState('Tutte');
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

  useEffect(() => { load().catch(() => setStatus('Errore durante il caricamento.')); }, [guildId]);

  useEffect(() => {
    if (tab !== 'history') return;
    const qs = new URLSearchParams({ take: '100' });
    if (historyEvent) qs.set('eventKey', historyEvent);
    if (historyText) qs.set('q', historyText);
    api<{ items: LogItem[] }>(`/backend/api/guilds/${guildId}/events?${qs}`).then((x) => setHistory(x.items)).catch(() => setStatus('Impossibile caricare lo storico.'));
  }, [tab, guildId, historyEvent, historyText]);

  useEffect(() => {
    if (tab !== 'admin') return;
    Promise.all([
      api<PanelAudit[]>(`/backend/api/guilds/${guildId}/panel-audit`),
      api<AccessBinding[]>(`/backend/api/guilds/${guildId}/access-bindings`)
    ]).then(([audit, roleBindings]) => { setPanelLog(audit); setBindings(roleBindings); }).catch(() => setStatus('Impossibile caricare l’amministrazione.'));
  }, [tab, guildId]);

  const categories = useMemo(() => ['Tutte', ...Array.from(new Set(routes.map((x) => x.event.category)))], [routes]);
  const visibleRoutes = routes.filter(({ event }) => (category === 'Tutte' || event.category === category) && (`${event.label} ${event.key}`.toLowerCase().includes(filter.toLowerCase())));
  const textChannels = channels.filter((c) => textChannelTypes.has(c.type));
  const canAdmin = access === 'ADMIN' || access === 'OWNER';
  const canModerate = canAdmin || access === 'MODERATOR';
  const formatDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat(settings?.locale || 'it-IT', { dateStyle: 'short', timeStyle: 'medium', timeZone: settings?.timezone || 'Europe/Rome' }).format(new Date(value));
    } catch {
      return new Date(value).toLocaleString('it-IT');
    }
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await api(`/backend/api/guilds/${guildId}/settings`, { method: 'PUT', body: JSON.stringify(patch) });
    setStatus('Impostazioni salvate.');
    setTimeout(() => setStatus(''), 1800);
  };

  const saveRoute = async (eventKey: string, patch: Partial<Route>) => {
    setRoutes((current) => current.map((row) => row.event.key === eventKey ? { ...row, route: { ...(row.route as Route), eventKey, ...patch } } : row));
    await api(`/backend/api/guilds/${guildId}/routes/${encodeURIComponent(eventKey)}`, { method: 'PUT', body: JSON.stringify(patch) });
    setStatus('Logger aggiornato.');
    setTimeout(() => setStatus(''), 1400);
  };

  const bulk = async (enabled: boolean, includeNoisy = false) => {
    await api(`/backend/api/guilds/${guildId}/routes/bulk`, { method: 'POST', body: JSON.stringify({ enabled, includeNoisy }) });
    await load();
  };

  if (!settings) return <main className="loading">Caricamento pannello…</main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left"><a className="back" href="/dashboard">←</a><div><p className="eyebrow">SERVER</p><h1>{settings.guildName}</h1></div></div>
        <div className="status-pill"><span className="status-dot" /> Audit attivo</div>
      </header>

      <nav className="tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Panoramica</button>
        <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>Logger</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Storico</button>
        {canAdmin && <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>Amministrazione</button>}
      </nav>

      {status && <div className="toast">{status}</div>}

      <section className="content">
        {!canAdmin && <div className="notice">Accesso pannello: <strong>{access}</strong>. Le impostazioni sono in sola lettura.</div>}
        {tab === 'overview' && <>
          <div className="stat-grid">
            <div className="stat-card"><span>Eventi oggi</span><strong>{stats?.today ?? 0}</strong></div>
            <div className="stat-card"><span>Ultime 24 ore</span><strong>{stats?.last24h ?? 0}</strong></div>
            <div className="stat-card"><span>Snapshot messaggi</span><strong>{stats?.snapshots ?? 0}</strong></div>
            <div className="stat-card"><span>Retention</span><strong>{settings.defaultRetentionDays}g</strong></div>
            <div className="stat-card"><span>Problemi invio 24h</span><strong>{stats?.deliveryIssues ?? 0}</strong></div>
          </div>

          <div className="two-col">
            <section className="panel">
              <div className="panel-title"><div><p className="eyebrow">DESTINAZIONE</p><h2>Impostazioni generali</h2></div></div>
              <label>Canale log predefinito<select disabled={!canAdmin} value={settings.defaultLogChannelId ?? ''} onChange={(e) => saveSettings({ defaultLogChannelId: e.target.value || null })}><option value="">Nessuno</option>{textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select></label>
              <label>Retention dati<input disabled={!canAdmin} type="number" min="1" max="3650" value={settings.defaultRetentionDays} onChange={(e) => saveSettings({ defaultRetentionDays: Number(e.target.value) })} /></label>
              <div className="inline-fields"><label>Fuso orario<input disabled={!canAdmin} value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} onBlur={() => saveSettings({ timezone: settings.timezone })} /></label><label>Locale<input disabled={!canAdmin} value={settings.locale} onChange={(e) => setSettings({ ...settings, locale: e.target.value })} onBlur={() => saveSettings({ locale: settings.locale })} /></label></div>
              <div className="inline-fields"><label>Colore embed<input disabled={!canAdmin} type="color" value={settings.embedColor} onChange={(e) => saveSettings({ embedColor: e.target.value })} /></label><label>Footer<input disabled={!canAdmin} value={settings.embedFooter} onChange={(e) => setSettings({ ...settings, embedFooter: e.target.value })} onBlur={() => saveSettings({ embedFooter: settings.embedFooter })} /></label></div>
            </section>

            <section className="panel">
              <div className="panel-title"><div><p className="eyebrow">DATI</p><h2>Acquisizione</h2></div></div>
              <Toggle disabled={!canAdmin} label="Snapshot messaggi" description="Conserva una copia per ricostruire i messaggi eliminati." checked={settings.messageSnapshotEnabled} onChange={(value) => saveSettings({ messageSnapshotEnabled: value })} />
              <Toggle disabled={!canAdmin} label="Contenuto messaggi" description="Salva testo ed embed negli snapshot." checked={settings.storeMessageContent} onChange={(value) => saveSettings({ storeMessageContent: value })} />
              <Toggle disabled={!canAdmin} label="Presenze" description="Status e attività. Può generare molti eventi." checked={settings.presenceLoggingEnabled} onChange={(value) => saveSettings({ presenceLoggingEnabled: value })} />
              <Toggle disabled={!canAdmin} label="Typing" description="Registra quando un utente inizia a scrivere." checked={settings.typingLoggingEnabled} onChange={(value) => saveSettings({ typingLoggingEnabled: value })} />
              <Toggle disabled={!canAdmin} label="Gateway raw" description="Debug avanzato: salva eventi Gateway grezzi." checked={settings.rawGatewayEnabled} onChange={(value) => saveSettings({ rawGatewayEnabled: value })} danger />
            </section>
          </div>

          <section className="panel">
            <div className="panel-title"><div><p className="eyebrow">VOLUME</p><h2>Eventi nelle ultime 24 ore</h2></div></div>
            <div className="bars">{stats?.groups.map((g) => <div className="bar-row" key={g.eventKey}><span>{g.eventKey}</span><div><i style={{ width: `${Math.max(3, Math.min(100, g.count / Math.max(...stats.groups.map(x => x.count), 1) * 100))}%` }} /></div><b>{g.count}</b></div>)}</div>
          </section>
        </>}

        {tab === 'events' && <>
          <div className="toolbar">
            <input placeholder="Cerca logger…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
            <button disabled={!canAdmin} onClick={() => bulk(true, false)}>Invia standard</button>
            <button className="secondary" disabled={!canAdmin} onClick={() => bulk(false, true)}>Ferma invio</button>
          </div>
          <div className="route-list">
            {visibleRoutes.map(({ event, route }) => <RouteEditor key={event.key} event={event} route={route} channels={textChannels} roles={roles} onSave={(patch) => saveRoute(event.key, patch)} readOnly={!canAdmin} />)}
          </div>
        </>}

        {tab === 'history' && <>
          <div className="toolbar"><input placeholder="Cerca nel riepilogo…" value={historyText} onChange={(e) => setHistoryText(e.target.value)} /><select value={historyEvent} onChange={(e) => setHistoryEvent(e.target.value)}><option value="">Tutti gli eventi</option>{routes.map(({ event }) => <option key={event.key} value={event.key}>{event.label}</option>)}</select>{canModerate && <a className="button-link" href={`/backend/api/guilds/${guildId}/export`}>Esporta JSON</a>}</div>
          <div className="history-list">{history.map((item) => <article key={item.id} className="history-item"><div><span className="event-key">{item.eventKey} · {item.dispatchState}</span><time>{formatDate(item.createdAt)}</time></div><strong>{item.summary}</strong><p>{item.actorId ? `Actor: ${item.actorId}` : ''}{item.channelId ? ` · Canale: ${item.channelId}` : ''}</p><details><summary>Dettagli</summary>{item.dispatchError && <p>Errore invio: {item.dispatchError}</p>}<pre>{JSON.stringify(item.details, null, 2)}</pre></details></article>)}</div>
        </>}

        {tab === 'admin' && canAdmin && <>
          <AccessBindings guildId={guildId} roles={roles} bindings={bindings} onChange={setBindings} />
          <div className="two-col">
            <section className="panel"><div className="panel-title"><div><p className="eyebrow">AUDIT</p><h2>Modifiche dal pannello</h2></div></div><div className="admin-log">{panelLog.map((item) => <div key={item.id}><strong>{item.username}</strong><span>{item.action}</span><time>{formatDate(item.createdAt)}</time></div>)}</div></section>
            <section className="panel danger-panel"><div className="panel-title"><div><p className="eyebrow">PRIVACY</p><h2>Cancellazione dati utente</h2></div></div><p className="muted">Elimina snapshot ed eventi associati a uno specifico Discord User ID.</p><PrivacyDelete guildId={guildId} onDone={() => setStatus('Dati utente eliminati.')} /></section>
          </div>
        </>}
      </section>
    </main>
  );
}

function Toggle({ label, description, checked, onChange, danger, disabled }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; danger?: boolean; disabled?: boolean }) {
  return <div className={`toggle-row ${danger ? 'danger-toggle' : ''}`}><div><strong>{label}</strong><span>{description}</span></div><button disabled={disabled} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><i /></button></div>;
}

function RouteEditor({ event, route, channels, roles, onSave, readOnly }: { event: EventDefinition; route: Route | null; channels: Channel[]; roles: Role[]; onSave: (patch: Partial<Route>) => void; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(route?.customTitle ?? '');
  useEffect(() => setTitle(route?.customTitle ?? ''), [route?.customTitle]);
  if (!route) return null;
  return <article className={`route-card ${route.enabled ? 'enabled' : ''}`}>
    <div className="route-head"><button disabled={readOnly} title="Invio Discord" className={`switch ${route.enabled ? 'on' : ''}`} onClick={() => onSave({ enabled: !route.enabled })}><i /></button><div className="route-name" onClick={() => setOpen(!open)}><div><strong>{event.label}</strong>{event.noisy && <span className="badge">ALTO VOLUME</span>}{!route.captureEnabled && <span className="badge">NON ACQUISITO</span>}</div><span>{event.key} · {event.description}</span></div><button className="chevron" onClick={() => setOpen(!open)}>{open ? '⌃' : '⌄'}</button></div>
    {open && <div className="route-config">
      <label>Canale destinazione<select disabled={readOnly} value={route.destinationChannelId ?? ''} onChange={(e) => onSave({ destinationChannelId: e.target.value || null })}><option value="">Usa predefinito</option>{channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select></label>
      <label>Titolo personalizzato<input disabled={readOnly} value={title} placeholder={event.label} onBlur={() => onSave({ customTitle: title || null })} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="inline-fields"><label>Colore<input disabled={readOnly} type="color" value={route.embedColor ?? '#3f3c54'} onChange={(e) => onSave({ embedColor: e.target.value })} /></label><label>Menziona ruolo<select disabled={readOnly} value={route.mentionRoleIds[0] ?? ''} onChange={(e) => onSave({ mentionRoleIds: e.target.value ? [e.target.value] : [] })}><option value="">Nessuno</option>{roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</select></label><label>Retention evento<input disabled={readOnly} type="number" min="1" max="3650" defaultValue={route.retentionDays ?? ''} placeholder="Default" onBlur={(e) => onSave({ retentionDays: e.currentTarget.value ? Number(e.currentTarget.value) : null })} /></label></div>
      <div className="inline-fields"><label>Footer personalizzato<input disabled={readOnly} defaultValue={route.customFooter ?? ''} placeholder="Usa footer globale" onBlur={(e) => onSave({ customFooter: e.currentTarget.value || null })} /></label><label>Testo prima dell'embed<input disabled={readOnly} defaultValue={route.textPrefix ?? ''} placeholder="Opzionale" onBlur={(e) => onSave({ textPrefix: e.currentTarget.value || null })} /></label><label>Thumbnail URL<input disabled={readOnly} type="url" defaultValue={route.thumbnailUrl ?? ''} placeholder="https://..." onBlur={(e) => onSave({ thumbnailUrl: e.currentTarget.value || null })} /></label></div>
      <div className="mini-toggles"><label><input type="checkbox" disabled={readOnly} checked={route.captureEnabled} onChange={(e) => onSave({ captureEnabled: e.target.checked })} /> Acquisisci nel database</label><label><input type="checkbox" disabled={readOnly} checked={route.enabled} onChange={(e) => onSave({ enabled: e.target.checked })} /> Invia su Discord</label><label><input type="checkbox" disabled={readOnly} checked={route.showTimestamp} onChange={(e) => onSave({ showTimestamp: e.target.checked })} /> Timestamp</label><label><input type="checkbox" disabled={readOnly} checked={route.showActor} onChange={(e) => onSave({ showActor: e.target.checked })} /> Actor</label><label><input type="checkbox" disabled={readOnly} checked={route.showTarget} onChange={(e) => onSave({ showTarget: e.target.checked })} /> Target</label><label><input type="checkbox" disabled={readOnly} checked={route.showChannel} onChange={(e) => onSave({ showChannel: e.target.checked })} /> Canale</label><label><input type="checkbox" disabled={readOnly} checked={route.includeContent} onChange={(e) => onSave({ includeContent: e.target.checked })} /> Contenuto nell’embed</label><label><input type="checkbox" disabled={readOnly} checked={route.includeAttachments} onChange={(e) => onSave({ includeAttachments: e.target.checked })} /> Allegati nell’embed</label><label><input type="checkbox" disabled={readOnly} checked={route.ignoreBots} onChange={(e) => onSave({ ignoreBots: e.target.checked })} /> Ignora bot</label></div>
      <div className="inline-fields"><CsvField disabled={readOnly} label="Ignora User ID" values={route.ignoredUserIds} onSave={(v) => onSave({ ignoredUserIds: v })} /><CsvField disabled={readOnly} label="Ignora Role ID" values={route.ignoredRoleIds} onSave={(v) => onSave({ ignoredRoleIds: v })} /><CsvField disabled={readOnly} label="Ignora Channel ID" values={route.ignoredChannelIds} onSave={(v) => onSave({ ignoredChannelIds: v })} /></div>
      <div className="embed-preview" style={{ borderLeftColor: route.embedColor ?? '#3f3c54' }}><small>ANTEPRIMA EMBED</small><strong>{title || event.label}</strong><span>{event.description}</span>{route.showActor && <em>Autore azione · @utente</em>}{route.showChannel && <em>Canale · #canale</em>}<small>{route.customFooter || 'Footer globale'}{route.showTimestamp ? ' · timestamp' : ''}</small></div>
    </div>}
  </article>;
}

function CsvField({ label, values, onSave, disabled }: { label: string; values: string[]; onSave: (values: string[]) => void; disabled?: boolean }) {
  const [value, setValue] = useState(values.join(', '));
  return <label>{label}<input disabled={disabled} value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => onSave(value.split(',').map((x) => x.trim()).filter(Boolean))} /></label>;
}

function AccessBindings({ guildId, roles, bindings, onChange }: { guildId: string; roles: Role[]; bindings: AccessBinding[]; onChange: (bindings: AccessBinding[]) => void }) {
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
  return <section className="panel access-panel"><div className="panel-title"><div><p className="eyebrow">PERMESSI</p><h2>Accesso tramite ruoli Discord</h2></div></div><div className="access-add"><select value={roleId} onChange={(e) => setRoleId(e.target.value)}><option value="">Seleziona ruolo…</option>{roles.filter((r) => r.name !== '@everyone').map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</select><select value={level} onChange={(e) => setLevel(e.target.value as 'VIEWER' | 'MODERATOR' | 'ADMIN')}><option value="VIEWER">Viewer</option><option value="MODERATOR">Moderator</option><option value="ADMIN">Admin</option></select><button onClick={save}>Aggiungi</button></div><div className="binding-list">{bindings.map((b) => { const role = roles.find((r) => r.id === b.discordRoleId); return <div key={b.id}><span>@{role?.name ?? b.discordRoleId}</span><strong>{b.accessLevel}</strong><button onClick={() => remove(b.discordRoleId)}>Rimuovi</button></div>; })}</div></section>;
}

function PrivacyDelete({ guildId, onDone }: { guildId: string; onDone: () => void }) {
  const [userId, setUserId] = useState('');
  const submit = async () => {
    if (!/^\d{15,22}$/.test(userId)) return;
    if (!confirm(`Eliminare i dati salvati per ${userId}?`)) return;
    await api(`/backend/api/guilds/${guildId}/privacy/user/${userId}`, { method: 'DELETE' });
    setUserId(''); onDone();
  };
  return <div className="danger-action"><input placeholder="Discord User ID" value={userId} onChange={(e) => setUserId(e.target.value)} /><button onClick={submit}>Elimina dati</button></div>;
}
