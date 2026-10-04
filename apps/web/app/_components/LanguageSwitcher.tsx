import type { Locale } from '../i18n';

export function LanguageSwitcher({
  locale,
  itHref,
  enHref,
  mobile = false,
  compact = false
}: {
  locale: Locale;
  itHref: string;
  enHref: string;
  mobile?: boolean;
  compact?: boolean;
}) {
  const className = mobile
    ? 'mobile-language-switcher'
    : `language-switcher${compact ? ' dashboard-language-switcher' : ''}`;

  return (
    <div className={className} aria-label={locale === 'it' ? 'Selettore lingua' : 'Language selector'}>
      <a className={locale === 'it' ? 'is-active' : ''} href={itHref} lang="it" hrefLang="it" aria-current={locale === 'it' ? 'page' : undefined}>IT{mobile ? ' · Italiano' : ''}</a>
      <a className={locale === 'en' ? 'is-active' : ''} href={enHref} lang="en" hrefLang="en" aria-current={locale === 'en' ? 'page' : undefined}>EN{mobile ? ' · English' : ''}</a>
    </div>
  );
}
