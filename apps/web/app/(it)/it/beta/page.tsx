import type { Metadata } from 'next';
import BetaWaitlist from '../../../_components/BetaWaitlist';
import { pageMetadata } from '../../../_components/seo';

export const metadata: Metadata = pageMetadata({
  locale: 'it',
  path: '/beta',
  title: 'Beta — Aggiungi Sentinel al tuo server Discord',
  description: "Sentinel è in beta. Accedi con Discord, richiedi l'accesso per il tuo server e aggiungi il bot di audit log una volta approvato."
});

export default function Page() { return <BetaWaitlist locale="it" />; }
