import { notFound } from 'next/navigation';

/** Any path without a page: hands over to the localized not-found page. */
export default function Page() { notFound(); }
