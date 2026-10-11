import type { Metadata } from 'next';
import PricingPage from '../../../_components/PricingPage';
import { pageMetadata } from '../../../_components/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMetadata({
  locale: 'it',
  path: '/pricing',
  title: 'Prezzi — Piani gratuiti e premium per i log di Discord',
  description: 'Confronta i piani di Sentinel: bot di log Discord gratuito per moderazione e messaggi, più i piani Plus, Pro e Brand con logger ad alto volume, storico più lungo e nome e banner del bot personalizzati.'
});

export default function Page() { return <PricingPage locale="it" />; }
