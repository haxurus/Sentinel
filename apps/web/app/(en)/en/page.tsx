import type { Metadata } from 'next';
import PublicHome from '../../_components/PublicHome';
import { pageMetadata } from '../../_components/seo';

export const metadata: Metadata = pageMetadata({
  locale: 'en',
  path: '',
  title: 'Sentinel — Discord Audit Log & Logging Bot',
  description: 'Free, open-source Discord logging bot. Log bans, kicks, timeouts, role and permission changes, edited and deleted messages, voice and AutoMod, with an encrypted, searchable history and a log channel per event.',
  absoluteTitle: true
});

export default function Page() { return <PublicHome locale="en" />; }
