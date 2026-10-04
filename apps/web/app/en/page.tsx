import type { Metadata } from 'next';
import PublicHome from '../_components/PublicHome';

export const metadata: Metadata = {
  title: 'Sentinel | Discord Audit & Logging',
  description: 'Self-hosted logging and auditing for Discord servers, with searchable history and web configuration.',
  alternates: { canonical: '/en', languages: { it: '/it', en: '/en', 'x-default': '/it' } }
};

export default function Page() { return <PublicHome locale="en" />; }
