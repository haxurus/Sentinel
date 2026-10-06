'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Brand';
import { SiteFooter, SiteHeader } from './SiteChrome';
import type { Locale } from '../i18n';

type Guild = {
  guildId: string;
  guildName: string;
  iconUrl: string | null;
  defaultLogChannelId: string | null;
};

type Me = { username: string; avatarUrl: string | null; superAdmin: boolean };

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
    back: 'Torna alla home',
    superConsole: 'Super console'
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
    back: 'Back to home',
    superConsole: 'Super console'
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
      <SiteHeader
        locale={locale}
        itHref="/it/dashboard"
        enHref="/en/dashboard"
        links={[
          { href: home, label: 'Home' },
          ...(me?.superAdmin ? [{ href: `/${locale}/super`, label: c.superConsole }] : [])
        ]}
        actions={<a className="button button-primary" href={`/backend/bot/invite?lang=${locale}`}>{c.nav.add}</a>}
      />

      <section className="page">
        <div className="site-container">
          <div className="page-head">
            <div>
              <span className="kicker">{c.kicker}</span>
              <h1>{c.title}</h1>
              <p>{c.intro}</p>
            </div>
            {me && <div className="user-card">
              {me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : <div className="avatar-fallback">{me.username.slice(0, 1)}</div>}
              <div><span>{c.connected}</span><strong>{me.username}</strong></div>
            </div>}
          </div>

          {loading && <div className="card skeleton-card"><span className="kicker">{c.session}</span><h2>{c.checking}</h2><p>{c.checkingText}</p></div>}

          {!loading && error && (
            <div className="auth-grid">
              <div className="card card-feature">
                <span className="kicker">{c.loginKicker}</span>
                <h2>{c.loginTitle}</h2>
                <p>{error}</p>
                <a className="button button-primary button-lg" href={`/backend/auth/discord?lang=${locale}`}>{c.loginButton}<Icon name="arrowRight" size={16} /></a>
              </div>
              <div className="card">
                <span className="kicker">{c.newServer}</span>
                <h2>{c.noBotTitle}</h2>
                <p>{c.noBotText}</p>
                <a className="button button-secondary button-lg" href={`/backend/bot/invite?lang=${locale}`}>{c.nav.add}</a>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="card">
              <div className="card-head">
                <div><span className="kicker">{c.serverKicker}</span><h2>{c.choose}</h2></div>
                <a className="button button-secondary" href={`/backend/bot/invite?lang=${locale}`}><Icon name="plus" size={16} />{c.addServer.replace(/^\+\s*/, '')}</a>
              </div>
              {!guilds.length && <div className="notice">{c.empty}</div>}
              <div className="guild-grid">
                {guilds.map((guild) => (
                  <a className="guild-card" href={`/${locale}/dashboard/${guild.guildId}`} key={guild.guildId}>
                    {guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : <div className="guild-placeholder">{guild.guildName.slice(0, 1)}</div>}
                    <div>
                      <strong>{guild.guildName}</strong>
                      <span className={guild.defaultLogChannelId ? 'tag tag-ok' : 'tag tag-warn'}>{guild.defaultLogChannelId ? c.configured : c.setup}</span>
                    </div>
                    <Icon name="arrowRight" size={18} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <SiteFooter locale={locale} />
    </main>
  );
}
