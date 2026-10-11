import type { Metadata } from 'next';
import PricingPage from '../../../_components/PricingPage';
import { pageMetadata } from '../../../_components/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMetadata({
  locale: 'en',
  path: '/pricing',
  title: 'Pricing — Free and premium Discord logging plans',
  description: 'Compare Sentinel plans: a free Discord logging bot with moderation and message logs, plus Plus, Pro and Brand plans with high-volume loggers, longer history and a custom bot name and banner.'
});

export default function Page() { return <PricingPage locale="en" />; }
