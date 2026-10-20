import type { Metadata } from 'next';
import GettingStartedPage from '../../../_components/GettingStartedPage';
import { pageMetadata } from '../../../_components/seo';

export const metadata: Metadata = pageMetadata({
  locale: 'it',
  path: '/getting-started',
  title: 'Primi passi con Sentinel',
  description: 'Aggiungi Sentinel al tuo server Discord e configura in cinque minuti dalla dashboard i log di audit, moderazione e messaggi: canale di log, logger, storico e accessi.'
});

export default function Page() { return <GettingStartedPage locale="it" />; }
