import type { Metadata, Viewport } from 'next';
import type { Locale } from '../i18n';

export const SITE_URL = 'https://sentinel.haxurus.com';
export const SITE_NAME = 'Sentinel';
export const REPO_URL = 'https://github.com/haxurus/Sentinel';

/** English is the default for visitors and crawlers without a language match. */
export const DEFAULT_LOCALE: Locale = 'en';

export const viewport: Viewport = {
  themeColor: '#0e0b16',
  colorScheme: 'dark'
};

/** Shared by every root layout (one per language, plus the language-neutral routes). */
export const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: { default: 'Sentinel — Discord audit log & logging bot', template: '%s | Sentinel' },
  description: 'Sentinel is a Discord logging bot that records bans, kicks, role and permission changes, edited and deleted messages, voice activity and more, with an encrypted searchable history and a web dashboard.',
  authors: [{ name: 'Haxurus', url: 'https://github.com/haxurus' }],
  creator: 'Haxurus',
  formatDetection: { telephone: false, email: false, address: false }
};

/**
 * Canonical URL and hreflang alternates for a page that exists in every
 * language. `path` is the part after the language prefix ('' for the home).
 */
export function localizedAlternates(locale: Locale, path = ''): Metadata['alternates'] {
  return {
    canonical: `/${locale}${path}`,
    languages: { en: `/en${path}`, it: `/it${path}`, 'x-default': `/${DEFAULT_LOCALE}${path}` }
  };
}

export function pageMetadata({ locale, path = '', title, description, absoluteTitle = false }: {
  locale: Locale;
  path?: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
}): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: localizedAlternates(locale, path),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: `/${locale}${path}`,
      title,
      description,
      locale: locale === 'it' ? 'it_IT' : 'en_US',
      alternateLocale: locale === 'it' ? ['en_US'] : ['it_IT']
    },
    twitter: { card: 'summary_large_image', title, description }
  };
}

/** Private, per-user pages: never indexed. */
export const privateMetadata: Metadata = { robots: { index: false, follow: false } };
