import type { Metadata } from 'next';
import BetaWaitlist from '../../_components/BetaWaitlist';

export const metadata: Metadata = {
  title: 'Beta e lista d’attesa | Sentinel',
  description: 'Iscriviti alla lista d’attesa della beta di Sentinel con il tuo account Discord.'
};

export default function Page() { return <BetaWaitlist locale="it" />; }
