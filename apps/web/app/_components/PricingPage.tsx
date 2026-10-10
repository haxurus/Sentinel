import PricingView from './PricingView';
import type { Locale } from '../i18n';
import type { PublicInfo } from './plans';

const apiOrigin = process.env.INTERNAL_API_URL || 'http://api:3001';

async function loadInfo(): Promise<PublicInfo | null> {
  try {
    const response = await fetch(`${apiOrigin}/api/public/info`, { cache: 'no-store', signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return null;
    return await response.json() as PublicInfo;
  } catch {
    return null;
  }
}

/** Server component: plans and promotions come from the API at request time. */
export default async function PricingPage({ locale }: { locale: Locale }) {
  return <PricingView locale={locale} info={await loadInfo()} />;
}
