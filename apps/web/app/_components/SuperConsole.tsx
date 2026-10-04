'use client';

import { useCallback, useEffect, useState } from 'react';
import { LanguageSwitcher } from './LanguageSwitcher';
import type { Locale } from '../i18n';

type Guild = {
  id: string;
  name: string;
  ownerId: string;
  ownerTag: string | null;
  memberCount: number;
  iconUrl: string | null;
  blocked: boolean;
  premiumEnabled: boolean;
};

type Block = {
  id: string;
  kind: 'USER' | 'GUILD';
  subjectId: string;
  reason: string | null;
  createdByUserId: string;
  createdAt: string;
};

type Audit = {
  id: string;
  username: string;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  createdAt: string;
};

type Overview = { guilds: Guild[]; blocks: Block[]; audit: Audit[] };

const copy = {
  it: {
    kicker: 'SUPER CONSOLE',
    title: 'Controllo globale di Sentinel.',
    intro: 'Area riservata al proprietario dell’istanza. Le azioni qui sotto hanno effetto su tutti i server collegati al bot.',
    dashboard: 'Dashboard',
    liveServers: 'Server collegati',
    liveServersText: 'Elenco live dalla sessione Discord del bot.',
    members: 'membri',
    owner: 'Proprietario',
    leave: 'Fai uscire',
    blockLeave: 'Blocca ed espelli',
    premium: 'Premium',
    free: 'Free',
    enablePremium: 'Attiva Premium',
    disablePremium: 'Disattiva Premium',
    confirmPremiumOff: 'Disattivare Premium per questo server? I logger ad alto volume verranno disattivati immediatamente.',
    noServers: 'Sentinel non è collegato ad alcun server.',
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
    auditText: 'Ultime azioni eseguite dalla super console.',
    noAudit: 'Nessuna azione registrata.',
    loading: 'Caricamento super console…',
    denied: 'Accesso negato. Questa area è disponibile solo al super-admin configurato.',
    failed: 'Operazione non riuscita.',
    refreshed: 'Dati aggiornati.',
    confirmLeave: 'Vuoi davvero far uscire Sentinel da questo server?',
    confirmBlock: 'Bloccare questo server e far uscire Sentinel?',
    confirmUnblock: 'Rimuovere questo elemento dalla blacklist?',
    invalidId: 'Inserisci un Discord ID valido (17-20 cifre).',
    user: 'Utente',
    guild: 'Server'
  },
  en: {
    kicker: 'SUPER CONSOLE',
    title: 'Global Sentinel control.',
    intro: 'Instance-owner area. Actions here affect every server connected to the bot.',
    dashboard: 'Dashboard',
    liveServers: 'Connected servers',
    liveServersText: 'Live list from the bot Discord session.',
    members: 'members',
    owner: 'Owner',
    leave: 'Leave server',
    blockLeave: 'Block & leave',
    premium: 'Premium',
    free: 'Free',
    enablePremium: 'Enable Premium',
    disablePremium: 'Disable Premium',
    confirmPremiumOff: 'Disable Premium for this server? High-volume loggers will be turned off immediately.',
    noServers: 'Sentinel is not connected to any server.',
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
    auditText: 'Latest actions performed from the super console.',
    noAudit: 'No actions recorded.',
    loading: 'Loading super console…',
    denied: 'Access denied. This area is available only to the configured super-admin.',
    failed: 'Operation failed.',
    refreshed: 'Data refreshed.',
    confirmLeave: 'Do you really want Sentinel to leave this server?',
    confirmBlock: 'Block this server and make Sentinel leave it?',
    confirmUnblock: 'Remove this item from the blacklist?',
    invalidId: 'Enter a valid Discord ID (17-20 digits).',
    user: 'User',
    guild: 'Server'
  }
} as const;

const snowflake = /^\d{17,20}$/;

export default function SuperConsole({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [guildId, setGuildId] = useState('');
  const [userReason, setUserReason] = useState('');
  const [guildReason, setGuildReason] = useState('');

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

  const action = async (url: string, init: RequestInit) => {
    setStatus('');
    const response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === 'string' ? body.error : 'REQUEST_FAILED');
    }
    await load();
    setStatus(c.refreshed);
  };

  const block = async (kind: 'USER' | 'GUILD', id: string, reason: string) => {
    if (!snowflake.test(id)) {
      setStatus(c.invalidId);
      return;
    }
    try {
      await action(`/backend/api/super/blocks/${kind}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ reason: reason.trim() || undefined })
      });
      if (kind === 'USER') { setUserId(''); setUserReason(''); }
      else { setGuildId(''); setGuildReason(''); }
    } catch {
      setStatus(c.failed);
    }
  };

  const setPremium = async (guild: Guild, premiumEnabled: boolean) => {
    if (!premiumEnabled && !confirm(c.confirmPremiumOff)) return;
    try {
      await action(`/backend/api/super/guilds/${guild.id}/premium`, {
        method: 'PUT',
        body: JSON.stringify({ premiumEnabled })
      });
    } catch {
      setStatus(c.failed);
    }
  };

  const leave = async (guild: Guild) => {
    if (!confirm(c.confirmLeave)) return;
    try {
      await action(`/backend/api/super/guilds/${guild.id}/leave`, { method: 'POST', body: '{}' });
    } catch {
      setStatus(c.failed);
    }
  };

  const blockGuild = async (guild: Guild) => {
    if (!confirm(c.confirmBlock)) return;
    try {
      await action(`/backend/api/super/blocks/GUILD/${guild.id}`, {
        method: 'PUT',
        body: JSON.stringify({ reason: 'Blocked from super console server list' })
      });
    } catch {
      setStatus(c.failed);
    }
  };

  const unblock = async (block: Block) => {
    if (!confirm(c.confirmUnblock)) return;
    try {
      await action(`/backend/api/super/blocks/${block.kind}/${block.subjectId}`, { method: 'DELETE' });
    } catch {
      setStatus(c.failed);
    }
  };

  const fmt = (value: string) => new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-US', {
    dateStyle: 'short', timeStyle: 'medium'
  }).format(new Date(value));

  return (
    <main className="public-site super-console" lang={locale}>
      <header className="site-header">
        <div className="site-container site-nav">
          <a className="site-brand" href={`/${locale}`} aria-label="Sentinel - Home">
            <span className="site-brand-mark" aria-hidden="true">S</span><span>Sentinel</span>
          </a>
          <nav className="site-nav-links"><a href={`/${locale}/dashboard`}>{c.dashboard}</a></nav>
          <LanguageSwitcher locale={locale} itHref="/it/super" enHref="/en/super" />
        </div>
      </header>

      <section className="super-shell">
        <div className="site-container">
          <div className="super-head">
            <span className="site-kicker">{c.kicker}</span>
            <h1>{c.title}</h1>
            <p>{c.intro}</p>
          </div>

          {status && <div className="notice">{status}</div>}
          {error && <div className="notice">{error}</div>}
          {!data && !error && <div className="super-panel">{c.loading}</div>}

          {data && <>
            <section className="super-panel">
              <div className="super-panel-head">
                <div><span className="site-kicker">DISCORD</span><h2>{c.liveServers}</h2><p>{c.liveServersText}</p></div>
                <strong>{data.guilds.length}</strong>
              </div>
              {!data.guilds.length && <div className="super-empty">{c.noServers}</div>}
              <div className="super-guild-list">
                {data.guilds.map((guild) => (
                  <article className="super-guild" key={guild.id}>
                    <div className="super-guild-identity">
                      {guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : <div className="guild-placeholder">{guild.name.slice(0, 1)}</div>}
                      <div><strong>{guild.name}</strong><span>{guild.id}</span></div>
                    </div>
                    <div className="super-guild-meta">
                      <span>{c.owner}: {guild.ownerTag || guild.ownerId}</span>
                      <span>{guild.memberCount.toLocaleString(locale === 'it' ? 'it-IT' : 'en-US')} {c.members}</span>
                      <span className={`super-plan-badge ${guild.premiumEnabled ? 'is-premium' : ''}`}>{guild.premiumEnabled ? c.premium : c.free}</span>
                    </div>
                    <div className="super-guild-actions">
                      <button className={`site-button ${guild.premiumEnabled ? 'site-button-secondary' : 'super-premium-button'}`} onClick={() => setPremium(guild, !guild.premiumEnabled)}>{guild.premiumEnabled ? c.disablePremium : c.enablePremium}</button>
                      <button className="site-button site-button-secondary" onClick={() => leave(guild)}>{c.leave}</button>
                      <button className="site-button super-danger" onClick={() => blockGuild(guild)}>{c.blockLeave}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="super-panel">
              <div className="super-panel-head">
                <div><span className="site-kicker">POLICY</span><h2>{c.blacklist}</h2><p>{c.blacklistText}</p></div>
                <strong>{data.blocks.length}</strong>
              </div>

              <div className="super-block-forms">
                <div>
                  <label>{c.userId}<input value={userId} onChange={(e) => setUserId(e.target.value.trim())} inputMode="numeric" placeholder="123456789012345678" /></label>
                  <label>{c.reason}<input value={userReason} onChange={(e) => setUserReason(e.target.value)} maxLength={500} /></label>
                  <button className="site-button site-button-secondary" onClick={() => block('USER', userId, userReason)}>{c.blockUser}</button>
                </div>
                <div>
                  <label>{c.guildId}<input value={guildId} onChange={(e) => setGuildId(e.target.value.trim())} inputMode="numeric" placeholder="123456789012345678" /></label>
                  <label>{c.reason}<input value={guildReason} onChange={(e) => setGuildReason(e.target.value)} maxLength={500} /></label>
                  <button className="site-button super-danger" onClick={() => block('GUILD', guildId, guildReason)}>{c.blockGuild}</button>
                </div>
              </div>

              {!data.blocks.length && <div className="super-empty">{c.noBlocks}</div>}
              <div className="super-block-list">
                {data.blocks.map((block) => (
                  <div className="super-block-row" key={block.id}>
                    <div><strong>{block.kind === 'USER' ? c.user : c.guild} · {block.subjectId}</strong><span>{block.reason || '—'} · {fmt(block.createdAt)}</span></div>
                    <span className="super-block-badge">{c.blocked}</span>
                    <button className="site-button site-button-secondary" onClick={() => unblock(block)}>{c.unblock}</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="super-panel">
              <div className="super-panel-head">
                <div><span className="site-kicker">AUDIT</span><h2>{c.audit}</h2><p>{c.auditText}</p></div>
                <strong>{data.audit.length}</strong>
              </div>
              {!data.audit.length && <div className="super-empty">{c.noAudit}</div>}
              <div className="super-audit-list">
                {data.audit.map((item) => (
                  <div className="super-audit-row" key={item.id}>
                    <strong>{item.action}</strong>
                    <span>{item.subjectType ? `${item.subjectType} · ${item.subjectId}` : '—'}</span>
                    <span>{item.username}</span>
                    <time>{fmt(item.createdAt)}</time>
                  </div>
                ))}
              </div>
            </section>
          </>}
        </div>
      </section>
    </main>
  );
}
