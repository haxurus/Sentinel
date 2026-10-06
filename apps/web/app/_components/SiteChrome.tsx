import type { ReactNode } from 'react';
import { Brand } from './Brand';
import { LanguageSwitcher } from './LanguageSwitcher';
import type { Locale } from '../i18n';

type NavLink = { href: string; label: string };

export function SiteHeader({
  locale,
  links = [],
  itHref,
  enHref,
  actions
}: {
  locale: Locale;
  links?: NavLink[];
  itHref: string;
  enHref: string;
  actions?: ReactNode;
}) {
  return (
    <header className="site-header">
      <div className="site-container site-nav">
        <Brand href={`/${locale}`} />
        {links.length > 0 && (
          <nav className="site-nav-links" aria-label={locale === 'it' ? 'Navigazione principale' : 'Main navigation'}>
            {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          </nav>
        )}
        <div className="site-nav-end">
          <LanguageSwitcher locale={locale} itHref={itHref} enHref={enHref} />
          {actions && <div className="site-nav-actions">{actions}</div>}
        </div>
        {(links.length > 0 || actions) && (
          <details className="site-mobile-menu">
            <summary aria-label={locale === 'it' ? 'Apri menu' : 'Open menu'}><span /><span /></summary>
            <div>
              {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
              <LanguageSwitcher locale={locale} itHref={itHref} enHref={enHref} mobile />
              {actions && <div className="site-mobile-actions">{actions}</div>}
            </div>
          </details>
        )}
      </div>
    </header>
  );
}

export function SiteFooter({ locale, children }: { locale: Locale; children?: ReactNode }) {
  return (
    <footer className="site-footer">
      <div className="site-container">
        {children}
        <div className="site-footer-bottom">
          <span>Sentinel © 2026 · {locale === 'it' ? 'Fatto da' : 'Made by'} Haxurus · <a href="https://github.com/haxurus/Sentinel" target="_blank" rel="noreferrer">Open source (AGPL-3.0)</a></span>
          <span className="mono">discord audit &amp; logging</span>
        </div>
      </div>
    </footer>
  );
}
