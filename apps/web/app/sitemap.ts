import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, SITE_URL } from './_components/seo';

const PAGES = [
  { path: '', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/getting-started', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/legal', priority: 0.3, changeFrequency: 'yearly' as const }
];

/** Every public page in both languages, each listing its hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.flatMap(({ path, priority, changeFrequency }) => {
    const languages = { en: `${SITE_URL}/en${path}`, it: `${SITE_URL}/it${path}`, 'x-default': `${SITE_URL}/${DEFAULT_LOCALE}${path}` };
    return (['en', 'it'] as const).map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified,
      changeFrequency,
      // English is the international default and ranks first.
      priority: locale === 'en' ? priority : Math.round(priority * 0.9 * 10) / 10,
      alternates: { languages }
    }));
  });
}
