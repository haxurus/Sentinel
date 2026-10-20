import { notFound } from 'next/navigation';

/** Any path outside /en and /it without a page: English not-found page. */
export default function Page() { notFound(); }
