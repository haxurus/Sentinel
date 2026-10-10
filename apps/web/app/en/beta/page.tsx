import type { Metadata } from 'next';
import BetaWaitlist from '../../_components/BetaWaitlist';

export const metadata: Metadata = {
  title: 'Beta and waitlist',
  description: 'Join the Sentinel beta waitlist with your Discord account.'
};

export default function Page() { return <BetaWaitlist locale="en" />; }
