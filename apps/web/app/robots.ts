import type { MetadataRoute } from 'next';
import { SITE_URL } from './_components/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      // Signed-in areas and the API have nothing to index.
      disallow: ['/backend/', '/dashboard', '/it/dashboard', '/en/dashboard', '/it/super', '/en/super']
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
