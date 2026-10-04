import type { Metadata } from 'next';
import PublicHome from '../_components/PublicHome';

export const metadata: Metadata = {
  title: 'Sentinel | Audit e logging Discord',
  description: 'Logging e auditing self-hosted per server Discord, con storico ricercabile e configurazione web.',
  alternates: { canonical: '/it', languages: { it: '/it', en: '/en', 'x-default': '/it' } }
};

export default function Page() { return <PublicHome locale="it" />; }
