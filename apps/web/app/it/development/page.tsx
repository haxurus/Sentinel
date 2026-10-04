import type { Metadata } from 'next';
import DevelopmentNotice from '../../_components/DevelopmentNotice';
export const metadata: Metadata = { title: 'Sentinel è ancora in sviluppo', description: 'L’istanza pubblica di Sentinel non accetta ancora installazioni su nuovi server.' };
export default function Page() { return <DevelopmentNotice locale="it" />; }
