import type { Metadata } from 'next';
import LegalPage from '../../../_components/LegalPage';
import { pageMetadata } from '../../../_components/seo';

export const metadata: Metadata = pageMetadata({
  locale: 'en',
  path: '/legal',
  title: 'Privacy policy and terms of service',
  description: 'How Sentinel, the Discord logging bot, processes server and dashboard data, how long it is kept, your rights, and the terms of the hosted service.'
});

export default function Page() { return <LegalPage locale="en" />; }
