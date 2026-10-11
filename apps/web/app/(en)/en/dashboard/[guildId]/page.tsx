import type { Metadata } from 'next';
import GuildDashboard from '../../../../_components/GuildDashboard';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <GuildDashboard guildId={guildId} locale="en" />;
}