import { LanguageSwitcher } from './LanguageSwitcher';
import type { Locale } from '../i18n';

const copy = {
  it: {
    kicker: 'ACCESSO LIMITATO',
    title: 'Sentinel è ancora in sviluppo.',
    text: 'Per ora l’istanza pubblica di Sentinel può essere aggiunta a nuovi server solo dal proprietario del progetto.',
    detail: 'Puoi seguire lo sviluppo su GitHub oppure fare un fork del progetto e self-hostarlo sulla tua infrastruttura.',
    github: 'Stato del progetto su GitHub',
    fork: 'Fai un fork e self-hostalo',
    home: 'Torna alla home'
  },
  en: {
    kicker: 'LIMITED ACCESS',
    title: 'Sentinel is still in development.',
    text: 'For now, the public Sentinel instance can only be added to new servers by the project owner.',
    detail: 'You can follow development on GitHub, or fork the project and self-host it on your own infrastructure.',
    github: 'View project status on GitHub',
    fork: 'Fork and self-host Sentinel',
    home: 'Back to home'
  }
} as const;

export default function DevelopmentNotice({ locale }: { locale: Locale }) {
  const c = copy[locale];
  return (
    <main className="public-site development-page" lang={locale}>
      <header className="site-header">
        <div className="site-container site-nav">
          <a className="site-brand" href={`/${locale}`} aria-label="Sentinel - Home">
            <span className="site-brand-mark" aria-hidden="true">S</span>
            <span>Sentinel</span>
          </a>
          <LanguageSwitcher locale={locale} itHref="/it/development" enHref="/en/development" />
        </div>
      </header>
      <section className="development-hero">
        <div className="site-container development-card">
          <span className="site-kicker">{c.kicker}</span>
          <h1>{c.title}</h1>
          <p>{c.text}</p>
          <p>{c.detail}</p>
          <div className="development-actions">
            <a className="site-button site-button-primary" href="https://github.com/haxurus/Sentinel" target="_blank" rel="noreferrer">{c.github}</a>
            <a className="site-button site-button-secondary" href="https://github.com/haxurus/Sentinel/fork" target="_blank" rel="noreferrer">{c.fork}</a>
          </div>
          <a className="development-home-link" href={`/${locale}`}>← {c.home}</a>
        </div>
      </section>
    </main>
  );
}
