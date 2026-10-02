'use client';

import { useEffect, useState } from 'react';

type Guild = {
  guildId: string;
  guildName: string;
  iconUrl: string | null;
  defaultLogChannelId: string | null;
};

type Me = { username: string; avatarUrl: string | null };

export default function Dashboard() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/backend/api/me').then((r) => r.ok ? r.json() : Promise.reject()),
      fetch('/backend/api/guilds').then((r) => r.ok ? r.json() : Promise.reject())
    ]).then(([user, servers]) => {
      setMe(user);
      setGuilds(servers);
    }).catch(() => setError('Sessione non valida. Accedi nuovamente con Discord.'));
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">CELESTIA</p><h1>Discord Audit</h1></div>
        <div className="user-chip">{me?.avatarUrl && <img src={me.avatarUrl} alt="" />}<span>{me?.username ?? '...'}</span></div>
      </header>
      <section className="content">
        <div className="section-heading"><div><p className="eyebrow">SERVER</p><h2>Scegli cosa amministrare</h2></div></div>
        {error && <div className="notice error">{error} <a href="/backend/auth/discord">Accedi</a></div>}
        {!error && !guilds.length && <div className="notice">Nessun server gestibile con il bot installato.</div>}
        <div className="guild-grid">
          {guilds.map((guild) => (
            <a className="guild-card" href={`/dashboard/${guild.guildId}`} key={guild.guildId}>
              {guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : <div className="guild-placeholder">{guild.guildName.slice(0, 1)}</div>}
              <div><strong>{guild.guildName}</strong><span>{guild.defaultLogChannelId ? 'Logger configurato' : 'Da configurare'}</span></div>
              <span className="arrow">→</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
