import type { Metadata } from 'next';
import DevelopmentNotice from '../../_components/DevelopmentNotice';
export const metadata: Metadata = { title: 'Sentinel is still in development', description: 'The public Sentinel instance is not accepting new server installations yet.' };
export default function Page() { return <DevelopmentNotice locale="en" />; }
