import { SiteFooter, SiteHeader } from './SiteChrome';
import type { Locale } from '../i18n';

const copy = {
  en: {
    title: 'Page not found',
    text: 'The page you are looking for does not exist or has moved. These links can help you find your way.',
    home: 'Home',
    guide: 'Getting started',
    dashboard: 'Dashboard',
    pricing: 'Pricing'
  },
  it: {
    title: 'Pagina non trovata',
    text: 'La pagina che cerchi non esiste o è stata spostata. Questi link possono aiutarti a ritrovare la strada.',
    home: 'Home',
    guide: 'Primi passi',
    dashboard: 'Dashboard',
    pricing: 'Prezzi'
  }
} as const;

export default function NotFoundPage({ locale }: { locale: Locale }) {
  const c = copy[locale];
  return (
    <main className="public-site" lang={locale}>
      <SiteHeader locale={locale} itHref="/it" enHref="/en" links={[{ href: `/${locale}/pricing`, label: c.pricing }, { href: `/${locale}/dashboard`, label: c.dashboard }]} />
      <section className="page not-found-page">
        <div className="site-container not-found">
          <span className="not-found-code mono">404</span>
          <h1>{c.title}</h1>
          <p>{c.text}</p>
          <div className="guide-actions">
            <a className="button button-primary" href={`/${locale}`}>{c.home}</a>
            <a className="button button-secondary" href={`/${locale}/getting-started`}>{c.guide}</a>
            <a className="button button-ghost" href={`/${locale}/dashboard`}>{c.dashboard}</a>
          </div>
        </div>
      </section>
      <SiteFooter locale={locale} />
    </main>
  );
}
