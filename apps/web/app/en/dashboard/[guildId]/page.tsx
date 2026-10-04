import GuildDashboard from '../../../_components/GuildDashboard';

export default async function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <GuildDashboard guildId={guildId} locale="en" />;
}
