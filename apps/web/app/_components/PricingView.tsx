'use client';

import { useState } from 'react';
import { Icon } from './Brand';
import { SiteFooter, SiteHeader } from './SiteChrome';
import ContactList from './ContactList';
import type { Locale } from '../i18n';
import { TIER_ORDER, formatLimit, formatPrice, limitLabels, promotionText, tierLabel, type PlanLimits, type PublicInfo } from './plans';

const copy = {
  it: {
    nav: { home: 'Home', beta: 'Beta', dashboard: 'Dashboard' },
    kicker: 'Piani',
    title: 'Un piano per ogni server.',
    intro: 'Il piano Free copre il logging di moderazione e struttura del server. I livelli a pagamento sbloccano i logger ad alto volume, alzano i limiti e aggiungono il supporto prioritario.',
    beta: 'Sentinel è in beta: i pagamenti online non sono ancora attivi. Per attivare un piano contattami direttamente, lo configuro io sul tuo server.',
    monthly: 'Mensile',
    yearly: 'Annuale',
    perMonth: '/mese',
    perYear: '/anno',
    save: 'risparmi',
    current: 'Gratis per sempre',
    promo: 'Promozione',
    code: 'codice',
    until: 'fino al',
    free: { cta: 'Entra in beta', text: 'Tutti i logger standard: ban, kick, ruoli, permessi, canali, messaggi modificati ed eliminati, AutoMod.' },
    tiers: {
      TIER1: 'Sblocca i logger ad alto volume più utili: nuovi messaggi, reazioni, sondaggi, interazioni, Audit Log completo. Limiti più alti e supporto prioritario.',
      TIER2: 'Tutte le funzioni sbloccate, comprese presenze, typing e Gateway raw, con i limiti più alti.',
      TIER3: 'Tutto il Livello 2, più nome e banner del bot personalizzati nel tuo server.'
    },
    contactCta: 'Contattami',
    compare: 'Confronto completo',
    feature: 'Funzione',
    rows: {
      standard: 'Logger standard (moderazione, messaggi, struttura)',
      tier1: 'Logger ad alto volume: messaggi, reazioni, sondaggi, interazioni, Audit Log',
      tier2: 'Logger avanzati: presenze, typing, Gateway raw, diagnostica',
      support: 'Supporto prioritario',
      branding: 'Nome e banner del bot personalizzati'
    },
    contactKicker: 'Contatti',
    contactTitle: 'Vuoi attivare un piano?',
    contactText: 'Scrivimi indicando l’ID del server e il piano che ti interessa (mensile o annuale, ed eventuale codice sconto). Ti rispondo e attivo il piano manualmente.',
    faqTitle: 'Domande frequenti',
    faq: [
      ['Cosa succede alla scadenza?', 'Il server torna al piano Free: i logger non inclusi vengono disattivati e i limiti tornano quelli gratuiti. La configurazione non viene cancellata.'],
      ['Cosa vuol dire “eventi al giorno”?', 'È il numero di eventi salvati nello storico in un giorno (UTC). Raggiunto il limite, gli eventi successivi non vengono registrati fino al giorno dopo.'],
      ['Posso provare prima di pagare?', 'Sì: il piano Free resta sempre disponibile e durante la beta posso attivare periodi di prova.']
    ],
    unavailable: 'Impossibile caricare i piani in questo momento. Riprova tra poco.',
    included: 'Incluso',
    notIncluded: 'Non incluso'
  },
  en: {
    nav: { home: 'Home', beta: 'Beta', dashboard: 'Dashboard' },
    kicker: 'Plans',
    title: 'A plan for every server.',
    intro: 'The Free plan covers moderation and server-structure logging. Paid levels unlock high-volume loggers, raise the limits and add priority support.',
    beta: 'Sentinel is in beta: online payments are not active yet. To activate a plan, contact me directly and I will set it up on your server.',
    monthly: 'Monthly',
    yearly: 'Yearly',
    perMonth: '/month',
    perYear: '/year',
    save: 'save',
    current: 'Free forever',
    promo: 'Promotion',
    code: 'code',
    until: 'until',
    free: { cta: 'Join the beta', text: 'Every standard logger: bans, kicks, roles, permissions, channels, edited and deleted messages, AutoMod.' },
    tiers: {
      TIER1: 'Unlocks the most useful high-volume loggers: new messages, reactions, polls, interactions, full Audit Log. Higher limits and priority support.',
      TIER2: 'Every feature unlocked, including presence, typing and raw Gateway, with the highest limits.',
      TIER3: 'Everything in Level 2, plus a custom bot name and banner in your server.'
    },
    contactCta: 'Contact me',
    compare: 'Full comparison',
    feature: 'Feature',
    rows: {
      standard: 'Standard loggers (moderation, messages, structure)',
      tier1: 'High-volume loggers: messages, reactions, polls, interactions, Audit Log',
      tier2: 'Advanced loggers: presence, typing, raw Gateway, diagnostics',
      support: 'Priority support',
      branding: 'Custom bot name and banner'
    },
    contactKicker: 'Contact',
    contactTitle: 'Want to activate a plan?',
    contactText: 'Write to me with your server ID and the plan you want (monthly or yearly, plus any discount code). I will reply and activate it manually.',
    faqTitle: 'FAQ',
    faq: [
      ['What happens when a plan expires?', 'The server goes back to Free: loggers outside the plan are switched off and the free limits apply again. Your configuration is not deleted.'],
      ['What does “events per day” mean?', 'The number of events stored in the history in one (UTC) day. Once reached, further events are not recorded until the next day.'],
      ['Can I try before paying?', 'Yes: the Free plan is always available, and during the beta I can enable trial periods.']
    ],
    unavailable: 'Plans cannot be loaded right now. Please try again shortly.',
    included: 'Included',
    notIncluded: 'Not included'
  }
} as const;

export default function PricingView({ locale, info }: { locale: Locale; info: PublicInfo | null }) {
  const c = copy[locale];
  const [billing, setBilling] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const plans = info ? TIER_ORDER.map((tier) => info.plans.find((plan) => plan.tier === tier)).filter((plan) => plan !== undefined) : [];
  const labels = limitLabels(locale);
  const check = (value: boolean) => value
    ? <span className="cell-yes" aria-label={c.included}><Icon name="check" size={16} /></span>
    : <span className="cell-no" aria-label={c.notIncluded}>—</span>;

  return (
    <main className="public-site" lang={locale}>
      <SiteHeader
        locale={locale}
        itHref="/it/pricing"
        enHref="/en/pricing"
        links={[
          { href: `/${locale}`, label: c.nav.home },
          { href: `/${locale}/beta`, label: c.nav.beta },
          { href: `/${locale}/dashboard`, label: c.nav.dashboard }
        ]}
      />

      <section className="page pricing-page">
        <div className="site-container">
          <div className="section-head pricing-head">
            <span className="kicker">{c.kicker}</span>
            <h1>{c.title}</h1>
            <p>{c.intro}</p>
          </div>

          <div className="notice premium-notice pricing-beta"><Icon name="clock" size={16} />{c.beta}</div>

          {info?.promotions.map((promo) => {
            const text = promotionText(promo, locale);
            return (
              <div className="promo-banner" key={promo.code}>
                <span className="tag tag-premium">{c.promo}</span>
                <strong>{text.amount}</strong>
                <span>{promo.description || text.scope}</span>
                <span className="mono">{c.code}: {promo.code}</span>
                {promo.validUntil && <span className="promo-until">{c.until} {new Date(promo.validUntil).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB')}</span>}
              </div>
            );
          })}

          {!info && <div className="notice notice-error">{c.unavailable}</div>}

          {info && <>
            <div className="billing-toggle" role="tablist" aria-label={`${c.monthly} / ${c.yearly}`}>
              <button role="tab" aria-selected={billing === 'MONTHLY'} className={billing === 'MONTHLY' ? 'active' : ''} onClick={() => setBilling('MONTHLY')}>{c.monthly}</button>
              <button role="tab" aria-selected={billing === 'YEARLY'} className={billing === 'YEARLY' ? 'active' : ''} onClick={() => setBilling('YEARLY')}>{c.yearly}</button>
            </div>

            <div className="plan-grid">
              {plans.map((plan) => {
                const free = plan.tier === 'FREE';
                const price = billing === 'YEARLY' ? plan.yearlyCents : plan.monthlyCents;
                const saving = plan.monthlyCents * 12 - plan.yearlyCents;
                return (
                  <article className={`plan-card ${plan.tier === 'TIER2' ? 'plan-featured' : ''}`} key={plan.tier}>
                    <span className="plan-level mono">{free ? 'FREE' : `${locale === 'it' ? 'LIVELLO' : 'LEVEL'} ${plan.level}`}</span>
                    <h2>{plan.name}</h2>
                    <div className="plan-price">
                      {free ? <strong>{formatPrice(0, locale)}</strong> : <><strong>{formatPrice(price, locale)}</strong><span>{billing === 'YEARLY' ? c.perYear : c.perMonth}</span></>}
                    </div>
                    <p className="plan-sub">{free ? c.current : billing === 'YEARLY' && saving > 0 ? `${c.save} ${formatPrice(saving, locale)}` : ' '}</p>
                    <p className="plan-text">{free ? c.free.text : c.tiers[plan.tier as 'TIER1' | 'TIER2' | 'TIER3']}</p>
                    <ul className="plan-points">
                      <li><Icon name="clock" size={15} />{formatLimit('retentionDays', plan.limits.retentionDays, locale)} {locale === 'it' ? 'di storico' : 'of history'}</li>
                      <li><Icon name="bolt" size={15} />{formatLimit('eventsPerDay', plan.limits.eventsPerDay, locale)} {locale === 'it' ? 'eventi/giorno' : 'events/day'}</li>
                      <li><Icon name="route" size={15} />{plan.limits.logChannels} {locale === 'it' ? 'canali di log' : 'log channels'}</li>
                      {plan.prioritySupport && <li><Icon name="users" size={15} />{c.rows.support}</li>}
                      {plan.customBranding && <li><Icon name="sliders" size={15} />{c.rows.branding}</li>}
                    </ul>
                    <a className={`button button-lg ${free ? 'button-secondary' : plan.tier === 'TIER2' ? 'button-primary' : 'button-secondary'}`} href={free ? `/${locale}/beta` : '#contact'}>
                      {free ? c.free.cta : c.contactCta}<Icon name="arrowRight" size={15} />
                    </a>
                  </article>
                );
              })}
            </div>

            <section className="compare">
              <h2>{c.compare}</h2>
              <div className="compare-scroll">
                <table className="compare-table">
                  <thead>
                    <tr><th>{c.feature}</th>{plans.map((plan) => <th key={plan.tier}>{tierLabel(plan.tier, locale)}</th>)}</tr>
                  </thead>
                  <tbody>
                    <tr><td>{c.rows.standard}</td>{plans.map((plan) => <td key={plan.tier}>{check(true)}</td>)}</tr>
                    <tr><td>{c.rows.tier1}</td>{plans.map((plan) => <td key={plan.tier}>{check(plan.level >= 1)}</td>)}</tr>
                    <tr><td>{c.rows.tier2}</td>{plans.map((plan) => <td key={plan.tier}>{check(plan.level >= 2)}</td>)}</tr>
                    {(Object.keys(labels) as Array<keyof PlanLimits>).map((key) => (
                      <tr key={key}><td>{labels[key]}</td>{plans.map((plan) => <td key={plan.tier} className="mono">{formatLimit(key, plan.limits[key], locale)}</td>)}</tr>
                    ))}
                    <tr><td>{c.rows.support}</td>{plans.map((plan) => <td key={plan.tier}>{check(plan.prioritySupport)}</td>)}</tr>
                    <tr><td>{c.rows.branding}</td>{plans.map((plan) => <td key={plan.tier}>{check(plan.customBranding)}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>}

          <section className="pricing-bottom" id="contact">
            <div className="card card-feature">
              <span className="kicker">{c.contactKicker}</span>
              <h2>{c.contactTitle}</h2>
              <p>{c.contactText}</p>
              <ContactList contacts={info?.contacts ?? null} locale={locale} />
            </div>
            <div className="card faq">
              <h2>{c.faqTitle}</h2>
              {c.faq.map(([question, answer]) => (
                <details key={question}><summary>{question}</summary><p>{answer}</p></details>
              ))}
            </div>
          </section>
        </div>
      </section>

      <SiteFooter locale={locale} />
    </main>
  );
}
