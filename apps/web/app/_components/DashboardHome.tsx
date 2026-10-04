'use client';

import { useEffect, useState } from 'react';
import { LanguageSwitcher } from './LanguageSwitcher';
import type { Locale } from '../i18n';

type Guild = {
  guildId: string;
  guildName: string;
  iconUrl: string | null;
  defaultLogChannelId: string | null;
};

type Me = { username: string; avatarUrl: string | null };

const copy = {
  it: {
    nav: { features: 'Funzioni', add: 'Aggiungi Sentinel' },
    kicker: 'DASHBOARD',
    title: 'Gestisci Sentinel.',
    intro: 'Accedi con Discord per configurare logger, routing, storico, retention e permessi del pannello.',
    connected: 'Connesso come',
    session: 'SESSIONE',
    checking: 'Verifica accesso in corso…',
    checkingText: 'Controllo la sessione Discord e i server associati al tuo account.',
    loginKicker: 'ACCESSO',
    loginTitle: 'Entra con il tuo account Discord.',
    loginError: 'Accedi con Discord per vedere e amministrare i server disponibili.',
    loginButton: 'Accedi con Discord',
    newServer: 'NUOVO SERVER',
    noBotTitle: 'Sentinel non è ancora nel server?',
    noBotText: 'Aggiungilo prima, poi torna qui e accedi con Discord per completare la configurazione.',
    serverKicker: 'SERVER',
    choose: 'Scegli cosa amministrare',
    addServer: '+ Aggiungi a un server',
    empty: 'Nessun server gestibile con Sentinel installato. Aggiungi il bot a un server oppure verifica i tuoi permessi Discord.',
    configured: 'Logger configurato',
    setup: 'Da configurare',
    back: 'Torna alla home'
  },
  en: {
    nav: { features: 'Features', add: 'Add Sentinel' },
    kicker: 'DASHBOARD',
    title: 'Manage Sentinel.',
    intro: 'Sign in with Discord to configure loggers, routing, history, retention and panel permissions.',
    connected: 'Signed in as',
    session: 'SESSION',
    checking: 'Checking access…',
    checkingText: 'Checking your Discord session and the servers connected to your account.',
    loginKicker: 'SIGN IN',
    loginTitle: 'Continue with your Discord account.',
    loginError: 'Sign in with Discord to view and manage the available servers.',
    loginButton: 'Sign in with Discord',
    newServer: 'NEW SERVER',
    noBotTitle: 'Is Sentinel not in the server yet?',
    noBotText: 'Add it first, then come back here and sign in with Discord to finish configuration.',
    serverKicker: 'SERVERS',
    choose: 'Choose what to manage',
    addServer: '+ Add to a server',
    empty: 'No manageable server has Sentinel installed. Add the bot to a server or check your Discord permissions.',
    configured: 'Logger configured',
    setup: 'Needs configuration',
    back: 'Back to home'
  }
} as const;

export default function DashboardHome({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const home = `/${locale}`;
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
      setError(c.loginError);
    }).finally(() => setLoading(false));
  }, [c.loginError]);

  return (
    <main className="public-site dashboard-landing" lang={locale}>
      <header className="site-header">
        <div className="site-container site-nav">
          <a className="site-brand" href={home} aria-label="Sentinel - Home">
            <span className="site-brand-mark" aria-hidden="true">S</span><span>Sentinel</span>
          </a>
          <nav className="site-nav-links" aria-label={locale === 'it' ? 'Navigazione dashboard' : 'Dashboard navigation'}>
            <a href={home}>Home</a>
            <a href={`${home}#features`}>{c.nav.features}</a>
          </nav>
          <LanguageSwitcher locale={locale} itHref="/it/dashboard" enHref="/en/dashboard" />
          <div className="site-nav-actions">
            <a className="site-button site-button-primary" href="/backend/bot/invite">{c.nav.add}</a>
          </div>
          <details className="site-mobile-menu">
            <summary aria-label={locale === 'it' ? 'Apri menu' : 'Open menu'}><span /><span /><span /></summary>
            <div>
              <a href={home}>Home</a>
              <a href={`${home}#features`}>{c.nav.features}</a>
                <LanguageSwitcher locale={locale} itHref="/it/dashboard" enHref="/en/dashboard" mobile />
              <a className="site-button site-button-primary" href="/backend/bot/invite">{c.nav.add}</a>
            </div>
          </details>
        </div>
      </header>

      <section className="dashboard-access">
        <div className="site-container">
          <div className="dashboard-access-head">
            <div><span className="site-kicker">{c.kicker}</span><h1>{c.title}</h1><p>{c.intro}</p></div>
            {me && <div className="dashboard-user">{me.avatarUrl && <img src={me.avatarUrl} alt="" />}<div><span>{c.connected}</span><strong>{me.username}</strong></div></div>}
          </div>

          {loading && <div className="dashboard-auth-card"><span className="site-kicker">{c.session}</span><h2>{c.checking}</h2><p>{c.checkingText}</p></div>}

          {!loading && error && (
            <div className="dashboard-auth-grid">
              <div className="dashboard-auth-card">
                <span className="site-kicker">{c.loginKicker}</span><h2>{c.loginTitle}</h2><p>{error}</p>
                <a className="site-button site-button-primary" href={`/backend/auth/discord?lang=${locale}`}>{c.loginButton}</a>
              </div>
              <div className="dashboard-auth-card dashboard-auth-card-secondary">
                <span className="site-kicker">{c.newServer}</span><h2>{c.noBotTitle}</h2><p>{c.noBotText}</p>
                <a className="site-button site-button-secondary" href="/backend/bot/invite">{c.nav.add}</a>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="dashboard-server-panel">
              <div className="dashboard-server-head">
                <div><span className="site-kicker">{c.serverKicker}</span><h2>{c.choose}</h2></div>
                <a className="site-button site-button-secondary" href="/backend/bot/invite">{c.addServer}</a>
              </div>
              {!guilds.length && <div className="notice">{c.empty}</div>}
              <div className="guild-grid">
                {guilds.map((guild) => (
                  <a className="guild-card" href={`/${locale}/dashboard/${guild.guildId}`} key={guild.guildId}>
                    {guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : <div className="guild-placeholder">{guild.guildName.slice(0, 1)}</div>}
                    <div><strong>{guild.guildName}</strong><span>{guild.defaultLogChannelId ? c.configured : c.setup}</span></div>
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
            <span>Sentinel © 2026 · Made with 💚 by Haxurus</span>
            <a href={home}>{c.back}</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
