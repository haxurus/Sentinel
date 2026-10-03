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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/backend/api/me').then((r) => r.ok ? r.json() : Promise.reject()),
      fetch('/backend/api/guilds').then((r) => r.ok ? r.json() : Promise.reject())
    ]).then(([user, servers]) => {
      setMe(user);
      setGuilds(servers);
    }).catch(() => {
      setError('Accedi con Discord per vedere e amministrare i server disponibili.');
    }).finally(() => setLoading(false));
  }, []);

  return (
    <main className="public-site dashboard-landing">
      <header className="site-header">
        <div className="site-container site-nav">
          <a className="site-brand" href="/" aria-label="Sentinel - Home">
            <span className="site-brand-mark" aria-hidden="true">S</span>
            <span>Sentinel</span>
          </a>
          <nav className="site-nav-links" aria-label="Navigazione dashboard">
            <a href="/">Home</a>
            <a href="/#funzioni">Funzioni</a>
            <a href="/#sicurezza">Sicurezza</a>
          </nav>
          <div className="site-nav-actions">
            <a className="site-button site-button-primary" href="/backend/bot/invite">Aggiungi Sentinel</a>
          </div>
        </div>
      </header>

      <section className="dashboard-access">
        <div className="site-container">
          <div className="dashboard-access-head">
            <div>
              <span className="site-kicker">DASHBOARD</span>
              <h1>Gestisci Sentinel.</h1>
              <p>Accedi con Discord per configurare logger, routing, storico, retention e permessi del pannello.</p>
            </div>
            {me && (
              <div className="dashboard-user">
                {me.avatarUrl && <img src={me.avatarUrl} alt="" />}
                <div><span>Connesso come</span><strong>{me.username}</strong></div>
              </div>
            )}
          </div>

          {loading && (
            <div className="dashboard-auth-card">
              <span className="site-kicker">SESSIONE</span>
              <h2>Verifica accesso in corso…</h2>
              <p>Controllo la sessione Discord e i server associati al tuo account.</p>
            </div>
          )}

          {!loading && error && (
            <div className="dashboard-auth-grid">
              <div className="dashboard-auth-card">
                <span className="site-kicker">ACCESSO</span>
                <h2>Entra con il tuo account Discord.</h2>
                <p>{error}</p>
                <a className="site-button site-button-primary" href="/backend/auth/discord">Accedi con Discord</a>
              </div>
              <div className="dashboard-auth-card dashboard-auth-card-secondary">
                <span className="site-kicker">NUOVO SERVER</span>
                <h2>Sentinel non è ancora nel server?</h2>
                <p>Aggiungilo prima, poi torna qui e accedi con Discord per completare la configurazione.</p>
                <a className="site-button site-button-secondary" href="/backend/bot/invite">Aggiungi Sentinel</a>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="dashboard-server-panel">
              <div className="dashboard-server-head">
                <div>
                  <span className="site-kicker">SERVER</span>
                  <h2>Scegli cosa amministrare</h2>
                </div>
                <a className="site-button site-button-secondary" href="/backend/bot/invite">+ Aggiungi a un server</a>
              </div>

              {!guilds.length && (
                <div className="notice">
                  Nessun server gestibile con Sentinel installato. Aggiungi il bot a un server oppure verifica i tuoi permessi Discord.
                </div>
              )}

              <div className="guild-grid">
                {guilds.map((guild) => (
                  <a className="guild-card" href={`/dashboard/${guild.guildId}`} key={guild.guildId}>
                    {guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : <div className="guild-placeholder">{guild.guildName.slice(0, 1)}</div>}
                    <div>
                      <strong>{guild.guildName}</strong>
                      <span>{guild.defaultLogChannelId ? 'Logger configurato' : 'Da configurare'}</span>
                    </div>
                    <span className="arrow">→</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="site-footer dashboard-footer">
        <div className="site-container">
          <div className="site-footer-bottom">
            <span>Sentinel © 2026 · Made by Haxurus</span>
            <a href="/">Torna alla home</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
