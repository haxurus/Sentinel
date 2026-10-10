'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Brand';
import { SiteFooter, SiteHeader } from './SiteChrome';
import ContactList from './ContactList';
import type { Locale } from '../i18n';
import type { Contacts } from './plans';

type Entry = {
  id: string;
  guildId: string;
  guildName: string | null;
  memberCount: number;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  installed: boolean;
};
type CandidateGuild = { id: string; name: string; iconUrl: string | null; installed: boolean };
type WaitlistState = { open: boolean; contacts: Contacts; entries: Entry[]; guilds: CandidateGuild[] };
type Me = { username: string; avatarUrl: string | null };

const copy = {
  it: {
    nav: { home: 'Home', pricing: 'Prezzi', dashboard: 'Dashboard' },
    kicker: 'Beta',
    title: 'Sentinel è in beta.',
    intro: 'Per ora il bot ospitato su sentinel.haxurus.com è disponibile solo sui server approvati. Iscriviti alla lista d’attesa: valuto le richieste a mano e ti abilito appena possibile.',
    steps: [
      ['Accedi con Discord', 'Serve solo per sapere chi sei e quali server gestisci.'],
      ['Indica il server', 'ID del server e numero di membri. Devi avere il permesso Gestisci server.'],
      ['Aggiungi il bot', 'Quando la richiesta è approvata trovi qui il pulsante per aggiungere Sentinel.']
    ],
    login: 'Accedi con Discord',
    loginText: 'Accedi per iscriverti alla lista d’attesa e vedere lo stato delle tue richieste.',
    closed: 'Le iscrizioni alla lista d’attesa sono chiuse in questo momento. Riprova più avanti oppure contattami.',
    formTitle: 'Richiedi l’accesso',
    pick: 'Scegli uno dei tuoi server',
    pickNone: 'Inserisci l’ID a mano',
    guildId: 'ID del server',
    guildIdHelp: 'Discord → Impostazioni server → Widget, oppure tasto destro sul server con la modalità sviluppatore attiva.',
    members: 'Numero di membri',
    note: 'Note (facoltative)',
    notePlaceholder: 'Che tipo di community è, cosa ti serve registrare…',
    submit: 'Invia richiesta',
    sent: 'Richiesta inviata. Riceverai l’accesso appena viene approvata.',
    mine: 'Le tue richieste',
    none: 'Non hai ancora inviato richieste.',
    status: { PENDING: 'In attesa', APPROVED: 'Approvata', REJECTED: 'Rifiutata' },
    add: 'Aggiungi Sentinel',
    open: 'Apri dashboard',
    withdraw: 'Ritira',
    confirmWithdraw: 'Ritirare questa richiesta?',
    membersShort: 'membri',
    pricingTitle: 'Piani e limiti',
    pricingText: 'Durante la beta tutti partono dal piano Free. I livelli a pagamento si attivano contattandomi.',
    pricingCta: 'Vedi i piani',
    contactTitle: 'Contatti',
    loading: 'Caricamento…',
    errors: {
      WAITLIST_CLOSED: 'Le iscrizioni sono chiuse.',
      INSTALL_BLOCKED: 'Questo server o account non può richiedere l’accesso.',
      GUILD_NOT_MANAGEABLE: 'Non risulti amministratore di questo server (serve il permesso Gestisci server). Se lo sei diventato da poco, esci e rientra con Discord.',
      ALREADY_INSTALLED: 'Sentinel è già presente in questo server.',
      ALREADY_APPROVED: 'Questa richiesta è già stata approvata.',
      WAITLIST_LIMIT: 'Hai già troppe richieste in attesa.',
      INVALID_BODY: 'Controlla ID del server e numero di membri.',
      RATE_LIMITED: 'Troppe richieste, riprova più tardi.',
      generic: 'Operazione non riuscita.'
    }
  },
  en: {
    nav: { home: 'Home', pricing: 'Pricing', dashboard: 'Dashboard' },
    kicker: 'Beta',
    title: 'Sentinel is in beta.',
    intro: 'For now the hosted bot at sentinel.haxurus.com is available only on approved servers. Join the waitlist: I review requests by hand and enable you as soon as possible.',
    steps: [
      ['Sign in with Discord', 'Only to know who you are and which servers you manage.'],
      ['Tell me the server', 'Server ID and member count. You need the Manage Server permission.'],
      ['Add the bot', 'Once your request is approved, the button to add Sentinel appears here.']
    ],
    login: 'Sign in with Discord',
    loginText: 'Sign in to join the waitlist and follow the status of your requests.',
    closed: 'The waitlist is closed right now. Try again later or contact me.',
    formTitle: 'Request access',
    pick: 'Pick one of your servers',
    pickNone: 'Enter the ID manually',
    guildId: 'Server ID',
    guildIdHelp: 'Discord → Server Settings → Widget, or right-click the server with Developer Mode enabled.',
    members: 'Member count',
    note: 'Notes (optional)',
    notePlaceholder: 'What kind of community it is, what you need to log…',
    submit: 'Send request',
    sent: 'Request sent. You will get access as soon as it is approved.',
    mine: 'Your requests',
    none: 'You have not sent any request yet.',
    status: { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' },
    add: 'Add Sentinel',
    open: 'Open dashboard',
    withdraw: 'Withdraw',
    confirmWithdraw: 'Withdraw this request?',
    membersShort: 'members',
    pricingTitle: 'Plans and limits',
    pricingText: 'During the beta everyone starts on the Free plan. Paid levels are activated by contacting me.',
    pricingCta: 'See plans',
    contactTitle: 'Contact',
    loading: 'Loading…',
    errors: {
      WAITLIST_CLOSED: 'The waitlist is closed.',
      INSTALL_BLOCKED: 'This server or account cannot request access.',
      GUILD_NOT_MANAGEABLE: 'You do not appear to manage this server (Manage Server permission required). If you got it recently, sign out and sign in again.',
      ALREADY_INSTALLED: 'Sentinel is already in this server.',
      ALREADY_APPROVED: 'This request has already been approved.',
      WAITLIST_LIMIT: 'You already have too many pending requests.',
      INVALID_BODY: 'Check the server ID and member count.',
      RATE_LIMITED: 'Too many requests, try again later.',
      generic: 'Operation failed.'
    }
  }
} as const;

export default function BetaWaitlist({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<WaitlistState | null>(null);
  const [publicInfo, setPublicInfo] = useState<{ waitlistOpen: boolean; contacts: Contacts } | null>(null);
  const [loading, setLoading] = useState(true);
  const [guildId, setGuildId] = useState('');
  const [memberCount, setMemberCount] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const meResponse = await fetch('/backend/api/me');
    if (!meResponse.ok) {
      setMe(null);
      const info = await fetch('/backend/api/public/info').then((r) => r.ok ? r.json() : null).catch(() => null);
      setPublicInfo(info);
      return;
    }
    setMe(await meResponse.json());
    const waitlist = await fetch('/backend/api/waitlist');
    if (waitlist.ok) setState(await waitlist.json());
  }, []);

  useEffect(() => { load().catch(() => null).finally(() => setLoading(false)); }, [load]);

  const errorText = (code: string) => (c.errors as Record<string, string>)[code] ?? `${c.errors.generic} (${code})`;

  const submit = async () => {
    setMessage(null);
    const members = Number(memberCount);
    if (!/^\d{17,20}$/.test(guildId.trim()) || !Number.isInteger(members) || members < 1) {
      setMessage({ kind: 'error', text: c.errors.INVALID_BODY });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/backend/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: guildId.trim(), memberCount: members, note: note.trim() || null })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setMessage({ kind: 'error', text: errorText(response.status === 429 && body.error !== 'WAITLIST_LIMIT' ? 'RATE_LIMITED' : body.error ?? 'generic') });
        return;
      }
      setGuildId(''); setMemberCount(''); setNote('');
      setMessage({ kind: 'ok', text: c.sent });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (entry: Entry) => {
    if (!confirm(c.confirmWithdraw)) return;
    const response = await fetch(`/backend/api/waitlist/${entry.id}`, { method: 'DELETE' });
    if (!response.ok) setMessage({ kind: 'error', text: c.errors.generic });
    await load();
  };

  const open = state?.open ?? publicInfo?.waitlistOpen ?? false;
  const contacts = state?.contacts ?? publicInfo?.contacts ?? null;
  const fmt = (value: string) => new Date(value).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB');
  const candidates = state?.guilds.filter((guild) => !guild.installed) ?? [];

  return (
    <main className="public-site" lang={locale}>
      <SiteHeader
        locale={locale}
        itHref="/it/beta"
        enHref="/en/beta"
        links={[
          { href: `/${locale}`, label: c.nav.home },
          { href: `/${locale}/pricing`, label: c.nav.pricing },
          { href: `/${locale}/dashboard`, label: c.nav.dashboard }
        ]}
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
              <div><span>Discord</span><strong>{me.username}</strong></div>
            </div>}
          </div>

          <ol className="beta-steps">
            {c.steps.map(([title, text], index) => (
              <li key={title}><span className="step-index mono">{String(index + 1).padStart(2, '0')}</span><div><strong>{title}</strong><p>{text}</p></div></li>
            ))}
          </ol>

          {loading && <div className="card skeleton-card"><h2>{c.loading}</h2></div>}

          {!loading && !me && (
            <div className="card card-feature">
              <span className="kicker">Discord</span>
              <h2>{c.login}</h2>
              <p>{open ? c.loginText : c.closed}</p>
              <a className="button button-primary button-lg" href={`/backend/auth/discord?lang=${locale}&intent=beta`}>{c.login}<Icon name="arrowRight" size={16} /></a>
            </div>
          )}

          {!loading && me && state && <div className="beta-grid">
            <section className="card">
              <span className="kicker">{c.kicker}</span>
              <h2>{c.formTitle}</h2>
              {message && <div className={`notice ${message.kind === 'error' ? 'notice-error' : 'notice-ok'}`}>{message.text}</div>}
              {!open && <div className="notice">{c.closed}</div>}
              {open && <>
                {candidates.length > 0 && <label>{c.pick}
                  <select value={candidates.some((guild) => guild.id === guildId) ? guildId : ''} onChange={(e) => setGuildId(e.target.value)}>
                    <option value="">{c.pickNone}</option>
                    {candidates.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
                  </select>
                </label>}
                <label>{c.guildId}<input value={guildId} onChange={(e) => setGuildId(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="123456789012345678" maxLength={20} /><small className="field-help">{c.guildIdHelp}</small></label>
                <label>{c.members}<input value={memberCount} onChange={(e) => setMemberCount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="250" maxLength={8} /></label>
                <label>{c.note}<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder={c.notePlaceholder} /></label>
                <button className="button button-primary button-lg" disabled={busy} onClick={submit}>{c.submit}</button>
              </>}
            </section>

            <section className="card">
              <span className="kicker">{c.kicker}</span>
              <h2>{c.mine}</h2>
              {!state.entries.length && <div className="empty">{c.none}</div>}
              <div className="table-list">
                {state.entries.map((entry) => (
                  <div className="waitlist-row" key={entry.id}>
                    <div>
                      <strong>{entry.guildName || entry.guildId}</strong>
                      <span className="mono">{entry.guildId} · {entry.memberCount.toLocaleString(locale === 'it' ? 'it-IT' : 'en-US')} {c.membersShort} · {fmt(entry.createdAt)}</span>
                    </div>
                    <span className={`tag ${entry.status === 'APPROVED' ? 'tag-ok' : entry.status === 'REJECTED' ? 'tag-danger' : 'tag-warn'}`}>{c.status[entry.status]}</span>
                    {entry.status === 'APPROVED'
                      ? entry.installed
                        ? <a className="button button-sm button-secondary" href={`/${locale}/dashboard/${entry.guildId}`}>{c.open}</a>
                        : <a className="button button-sm button-primary" href={`/backend/bot/invite?lang=${locale}&guild=${entry.guildId}`}>{c.add}</a>
                      : <button className="button button-sm button-ghost" onClick={() => withdraw(entry)}>{c.withdraw}</button>}
                  </div>
                ))}
              </div>
            </section>
          </div>}

          <div className="beta-grid">
            <section className="card">
              <span className="kicker">{c.nav.pricing}</span>
              <h2>{c.pricingTitle}</h2>
              <p>{c.pricingText}</p>
              <a className="button button-secondary" href={`/${locale}/pricing`}>{c.pricingCta}<Icon name="arrowRight" size={15} /></a>
            </section>
            <section className="card">
              <span className="kicker">{c.contactTitle}</span>
              <h2>{c.contactTitle}</h2>
              <ContactList contacts={contacts} locale={locale} />
            </section>
          </div>
        </div>
      </section>

      <SiteFooter locale={locale} />
    </main>
  );
}
