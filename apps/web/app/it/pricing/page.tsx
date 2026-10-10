import type { Metadata } from 'next';
import PricingPage from '../../_components/PricingPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Piani e prezzi',
  description: 'Piani di Sentinel: Free, Plus, Pro e Brand. Logger ad alto volume, limiti più alti, supporto prioritario e bot personalizzato.',
  alternates: { canonical: '/it/pricing', languages: { it: '/it/pricing', en: '/en/pricing' } }
};

export default function Page() { return <PricingPage locale="it" />; }
