'use client';

import { useState } from 'react';
import { Icon } from './Brand';
import { SiteFooter, SiteHeader } from './SiteChrome';
import ContactList from './ContactList';
import { StructuredData } from './StructuredData';
import { SITE_URL } from './seo';
import type { Locale } from '../i18n';
import { TIER_ORDER, formatLimit, formatPrice, limitLabels, tierLabel, type PaidTier, type PlanLimits, type PublicInfo } from './plans';

const copy = {
  it: {
    nav: { home: 'Home', dashboard: 'Dashboard' },
    kicker: 'Piani',
    title: 'Un piano per ogni server.',
    intro: 'Il piano Free copre il logging di moderazione e struttura del server. I livelli a pagamento sbloccano i logger ad alto volume, alzano i limiti e aggiungono il supporto prioritario.',
    payments: 'I piani a pagamento sono abbonamenti Discord: scegli il piano e il server e paghi direttamente su Discord, che gestisce pagamento, IVA e rinnovi.',
    paymentsSoon: 'I piani a pagamento saranno presto disponibili come abbonamenti Discord. Nel frattempo ogni server può usare il piano Free.',
    monthly: 'Mensile',
    yearly: 'Annuale',
    perMonth: '/mese',
    perYear: '/anno',
    save: 'risparmi',
    current: 'Gratis per sempre',
    free: { cta: 'Aggiungi Sentinel', text: 'Tutti i logger standard: ban, kick, ruoli, permessi, canali, messaggi modificati ed eliminati, AutoMod.' },
    tiers: {
      TIER1: 'Sblocca i logger ad alto volume più utili: nuovi messaggi, reazioni, sondaggi, interazioni, Audit Log completo. Limiti più alti e supporto prioritario.',
      TIER2: 'Tutti i logger, compresa la diagnostica Gateway, con limiti più alti e 60 giorni di storico.',
      TIER3: 'Tutto il Livello 2, più nome e banner del bot personalizzati nel tuo server.'
    },
    subscribe: 'Abbonati su Discord',
    priceNote: 'Il prezzo finale nella tua valuta, tasse incluse, è quello mostrato da Discord prima del pagamento.',
    scopeNote: 'Ogni abbonamento vale per un solo server e i limiti si contano per server. Sentinel registra solo ciò che Discord rende disponibile ai bot, con i permessi che gli hai dato.',
    soon: 'Presto su Discord',
    compare: 'Confronto completo',
    feature: 'Funzione',
    rows: {
      standard: 'Logger standard (moderazione, messaggi, struttura)',
      tier1: 'Logger ad alto volume: messaggi, reazioni, sondaggi, interazioni, Audit Log',
      tier2: 'Diagnostica Gateway e disponibilità del server',
      support: 'Supporto prioritario',
      branding: 'Nome e banner del bot personalizzati'
    },
    contactKicker: 'Contatti',
    contactTitle: 'Domande o una prova?',
    contactText: 'Scrivimi per domande sui piani, per un periodo di prova gratuito o per una collaborazione. I piani a pagamento si acquistano solo tramite Discord.',
    faqTitle: 'Domande frequenti',
    faq: [
      ['Come si paga?', 'Tramite Discord: apri il piano, scegli il server e abbonati. Discord elabora il pagamento e gestisce IVA e rinnovi; il piano si attiva da solo entro pochi minuti.'],
      ['Come disdico?', 'Dalle impostazioni utente di Discord, nella sezione degli abbonamenti. Il piano resta attivo fino alla fine del periodo già pagato.'],
      ['Cosa succede alla scadenza?', 'Il server torna al piano Free: i logger non inclusi vengono disattivati e i limiti tornano quelli gratuiti. La configurazione non viene cancellata.'],
      ['Cosa vuol dire “eventi al giorno”?', 'È il numero di eventi salvati nello storico in un giorno (UTC). Raggiunto il limite, gli eventi successivi non vengono registrati fino al giorno dopo.'],
      ['Posso provare prima di pagare?', 'Sì: il piano Free resta sempre disponibile e su richiesta posso attivare un periodo di prova gratuito dei piani a pagamento.']
    ],
    unavailable: 'Impossibile caricare i piani in questo momento. Riprova tra poco.',
    included: 'Incluso',
    notIncluded: 'Non incluso'
  },
  en: {
    nav: { home: 'Home', dashboard: 'Dashboard' },
    kicker: 'Plans',
    title: 'A plan for every server.',
    intro: 'The Free plan covers moderation and server-structure logging. Paid levels unlock high-volume loggers, raise the limits and add priority support.',
    payments: 'Paid plans are Discord subscriptions: choose the plan and the server and pay directly in Discord, which handles payment, VAT and renewals.',
    paymentsSoon: 'Paid plans will soon be available as Discord subscriptions. Meanwhile, every server can use the Free plan.',
    monthly: 'Monthly',
    yearly: 'Yearly',
    perMonth: '/month',
    perYear: '/year',
    save: 'save',
    current: 'Free forever',
    free: { cta: 'Add Sentinel', text: 'Every standard logger: bans, kicks, roles, permissions, channels, edited and deleted messages, AutoMod.' },
    tiers: {
      TIER1: 'Unlocks the most useful high-volume loggers: new messages, reactions, polls, interactions, full Audit Log. Higher limits and priority support.',
      TIER2: 'Every logger, including Gateway diagnostics, with higher limits and 60 days of history.',
      TIER3: 'Everything in Level 2, plus a custom bot name and banner in your server.'
    },
    subscribe: 'Subscribe on Discord',
    priceNote: 'The final price in your currency, taxes included, is shown by Discord before you pay.',
    scopeNote: 'Each subscription covers one server and the limits apply per server. Sentinel records only what Discord makes available to bots, with the permissions you give it.',
    soon: 'Coming soon on Discord',
    compare: 'Full comparison',
    feature: 'Feature',
    rows: {
      standard: 'Standard loggers (moderation, messages, structure)',
      tier1: 'High-volume loggers: messages, reactions, polls, interactions, Audit Log',
      tier2: 'Gateway diagnostics and server availability',
      support: 'Priority support',
      branding: 'Custom bot name and banner'
    },
    contactKicker: 'Contact',
    contactTitle: 'Questions or a trial?',
    contactText: 'Write to me with questions about the plans, for a free trial or for a partnership. Paid plans are bought only through Discord.',
    faqTitle: 'FAQ',
    faq: [
      ['How do I pay?', 'Through Discord: open the plan, choose your server and subscribe. Discord processes the payment and handles VAT and renewals; the plan switches on by itself within a few minutes.'],
      ['How do I cancel?', 'From your Discord user settings, in the subscriptions section. The plan stays active until the end of the period already paid.'],
      ['What happens when a plan expires?', 'The server goes back to Free: loggers outside the plan are switched off and the free limits apply again. Your configuration is not deleted.'],
      ['What does “events per day” mean?', 'The number of events stored in the history in one (UTC) day. Once reached, further events are not recorded until the next day.'],
      ['Can I try before paying?', 'Yes: the Free plan is always available, and on request I can enable a free trial of the paid plans.']
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
  const store = info?.discord ?? null;
  // Yearly prices are shown only when Discord sells a yearly subscription.
  const yearlyAvailable = Boolean(store && (['TIER1', 'TIER2', 'TIER3'] as const).some((tier) => store.links[tier].YEARLY));
  const period = yearlyAvailable ? billing : 'MONTHLY';
  const storeLink = (tier: string) => store?.links[tier as PaidTier]?.[period] ?? null;
  const labels = limitLabels(locale);
  const check = (value: boolean) => value
    ? <span className="cell-yes" aria-label={c.included}><Icon name="check" size={16} /></span>
    : <span className="cell-no" aria-label={c.notIncluded}>—</span>;

  return (
    <main className="public-site" lang={locale}>
      <StructuredData data={[
        ...(info ? [{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Sentinel',
          url: `${SITE_URL}/${locale}/pricing`,
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: 'Discord',
          offers: plans.flatMap((plan) => plan.tier === 'FREE'
            ? [{ '@type': 'Offer', name: plan.name, price: '0', priceCurrency: 'EUR' }]
            : [
                { '@type': 'Offer', name: `${plan.name} (${c.monthly})`, price: (plan.monthlyCents / 100).toFixed(2), priceCurrency: 'EUR' },
                ...(yearlyAvailable ? [{ '@type': 'Offer', name: `${plan.name} (${c.yearly})`, price: (plan.yearlyCents / 100).toFixed(2), priceCurrency: 'EUR' }] : [])
              ])
        }] : []),
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: c.faq.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } }))
        }
      ]} />
      <SiteHeader
        locale={locale}
        itHref="/it/pricing"
        enHref="/en/pricing"
        links={[
          { href: `/${locale}`, label: c.nav.home },
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

          {info && <div className="notice premium-notice pricing-notice"><Icon name="clock" size={16} />{store?.enabled ? c.payments : c.paymentsSoon}</div>}

          {!info && <div className="notice notice-error">{c.unavailable}</div>}

          {info && <>
            {yearlyAvailable && <div className="billing-toggle" role="tablist" aria-label={`${c.monthly} / ${c.yearly}`}>
              <button role="tab" aria-selected={billing === 'MONTHLY'} className={billing === 'MONTHLY' ? 'active' : ''} onClick={() => setBilling('MONTHLY')}>{c.monthly}</button>
              <button role="tab" aria-selected={billing === 'YEARLY'} className={billing === 'YEARLY' ? 'active' : ''} onClick={() => setBilling('YEARLY')}>{c.yearly}</button>
            </div>}

            <div className="plan-grid">
              {plans.map((plan) => {
                const free = plan.tier === 'FREE';
                const price = period === 'YEARLY' ? plan.yearlyCents : plan.monthlyCents;
                const link = free ? null : storeLink(plan.tier);
                const buttonClass = `button button-lg ${!free && plan.tier === 'TIER2' ? 'button-primary' : 'button-secondary'}`;
                const saving = plan.monthlyCents * 12 - plan.yearlyCents;
                return (
                  <article className={`plan-card ${plan.tier === 'TIER2' ? 'plan-featured' : ''}`} key={plan.tier}>
                    <span className="plan-level mono">{free ? 'FREE' : `${locale === 'it' ? 'LIVELLO' : 'LEVEL'} ${plan.level}`}</span>
                    <h2>{plan.name}</h2>
                    <div className="plan-price">
                      {free ? <strong>{formatPrice(0, locale)}</strong> : <><strong>{formatPrice(price, locale)}</strong><span>{period === 'YEARLY' ? c.perYear : c.perMonth}</span></>}
                    </div>
                    <p className="plan-sub">{free ? c.current : period === 'YEARLY' && saving > 0 ? `${c.save} ${formatPrice(saving, locale)}` : ' '}</p>
                    <p className="plan-text">{free ? c.free.text : c.tiers[plan.tier as 'TIER1' | 'TIER2' | 'TIER3']}</p>
                    <ul className="plan-points">
                      <li><Icon name="clock" size={15} />{formatLimit('retentionDays', plan.limits.retentionDays, locale)} {locale === 'it' ? 'di storico' : 'of history'}</li>
                      <li><Icon name="bolt" size={15} />{formatLimit('eventsPerDay', plan.limits.eventsPerDay, locale)} {locale === 'it' ? 'eventi/giorno' : 'events/day'}</li>
                      <li><Icon name="route" size={15} />{plan.limits.logChannels} {locale === 'it' ? 'canali di log' : 'log channels'}</li>
                      {plan.prioritySupport && <li><Icon name="users" size={15} />{c.rows.support}</li>}
                      {plan.customBranding && <li><Icon name="sliders" size={15} />{c.rows.branding}</li>}
                    </ul>
                    {free
                      ? <a className={buttonClass} href={`/backend/bot/invite?lang=${locale}`}>{c.free.cta}<Icon name="arrowRight" size={15} /></a>
                      : link
                        ? <a className={buttonClass} href={link} target="_blank" rel="noopener noreferrer">{c.subscribe}<Icon name="arrowRight" size={15} /></a>
                        : <span className="button button-lg button-secondary" aria-disabled="true">{c.soon}</span>}
                  </article>
                );
              })}
            </div>
            <p className="plan-footnote">{c.priceNote} {c.scopeNote}</p>

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
