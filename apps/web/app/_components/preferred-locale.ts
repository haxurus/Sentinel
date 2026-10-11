import { headers } from 'next/headers';
import type { Locale } from '../i18n';

/**
 * Language for language-neutral URLs (/, /dashboard): Italian only when the
 * browser prefers it over English; everyone else, crawlers included, gets
 * English, the x-default of every page.
 */
export async function preferredLocale(): Promise<Locale> {
  const header = (await headers()).get('accept-language') ?? '';
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().toLowerCase().split(';');
      const q = Number(params.find((param) => param.trim().startsWith('q='))?.split('=')[1] ?? 1);
      return { lang: tag.split('-')[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.lang === 'it' || entry.lang === 'en')
    .sort((a, b) => b.q - a.q);
  return ranked[0]?.lang === 'it' ? 'it' : 'en';
}
