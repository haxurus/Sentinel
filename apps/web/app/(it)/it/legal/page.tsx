import type { Metadata } from 'next';
import LegalPage from '../../../_components/LegalPage';
import { pageMetadata } from '../../../_components/seo';

export const metadata: Metadata = pageMetadata({
  locale: 'it',
  path: '/legal',
  title: 'Privacy policy e termini di servizio',
  description: 'Come Sentinel, il bot di log per Discord, tratta i dati dei server e della dashboard, per quanto li conserva, i tuoi diritti e i termini del servizio.'
});

export default function Page() { return <LegalPage locale="it" />; }
