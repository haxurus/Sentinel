import { redirect } from 'next/navigation';
import { preferredLocale } from '../_components/preferred-locale';

// Server-side redirect: crawlers and users without JavaScript land on a real
// page instead of an empty client-side redirect.
export default async function Page() {
  redirect(`/${await preferredLocale()}`);
}
