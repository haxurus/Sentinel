import type { Metadata } from 'next';
import SuperConsole from '../../_components/SuperConsole';

export const metadata: Metadata = {
  title: 'Super console | Sentinel',
  robots: { index: false, follow: false }
};

export default function Page() {
  return <SuperConsole locale="it" />;
}
