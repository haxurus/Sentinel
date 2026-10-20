import type { Metadata } from 'next';
import GettingStartedPage from '../../../_components/GettingStartedPage';
import { pageMetadata } from '../../../_components/seo';

export const metadata: Metadata = pageMetadata({
  locale: 'en',
  path: '/getting-started',
  title: 'Getting started with Sentinel',
  description: 'Add Sentinel to your Discord server and set up audit, moderation and message logs from the dashboard in five minutes: log channel, loggers, history and team access.'
});

export default function Page() { return <GettingStartedPage locale="en" />; }
