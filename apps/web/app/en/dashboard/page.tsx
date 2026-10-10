import type { Metadata } from 'next';
import DashboardHome from '../../_components/DashboardHome';
export const metadata: Metadata = { title: 'Dashboard', description: 'Manage Sentinel and your Discord server loggers.' };
export default function Page() { return <DashboardHome locale="en" />; }
