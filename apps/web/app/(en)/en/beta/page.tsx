import type { Metadata } from 'next';
import BetaWaitlist from '../../../_components/BetaWaitlist';
import { pageMetadata } from '../../../_components/seo';

export const metadata: Metadata = pageMetadata({
  locale: 'en',
  path: '/beta',
  title: 'Join the beta — Add Sentinel to your Discord server',
  description: 'Sentinel is in public beta. Sign in with Discord, request access for your server and add the audit log bot once approved.'
});

export default function Page() { return <BetaWaitlist locale="en" />; }
