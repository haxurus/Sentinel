import { redirect } from 'next/navigation';
import { preferredLocale } from '../../_components/preferred-locale';

export default async function Page() {
  redirect(`/${await preferredLocale()}/dashboard`);
}
