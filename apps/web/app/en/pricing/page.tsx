import type { Metadata } from 'next';
import PricingPage from '../../_components/PricingPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Plans and pricing | Sentinel',
  description: 'Sentinel plans: Free, Plus, Pro and Brand. High-volume loggers, higher limits, priority support and a custom-branded bot.',
  alternates: { canonical: '/en/pricing', languages: { it: '/it/pricing', en: '/en/pricing' } }
};

export default function Page() { return <PricingPage locale="en" />; }
