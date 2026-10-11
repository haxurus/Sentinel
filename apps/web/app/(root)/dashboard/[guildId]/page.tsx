import { redirect } from 'next/navigation';
import { preferredLocale } from '../../../_components/preferred-locale';

export default async function Page({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  redirect(`/${await preferredLocale()}/dashboard/${guildId}`);
}
