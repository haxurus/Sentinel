import { permanentRedirect } from 'next/navigation';

// Retired page from the private phase: Sentinel is open to every server.
export default function Page() { permanentRedirect('/it'); }
