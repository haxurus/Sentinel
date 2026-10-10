import type { Metadata } from 'next';
import DashboardHome from '../../_components/DashboardHome';
export const metadata: Metadata = { title: 'Dashboard', description: 'Gestisci Sentinel e i logger dei tuoi server Discord.' };
export default function Page() { return <DashboardHome locale="it" />; }
