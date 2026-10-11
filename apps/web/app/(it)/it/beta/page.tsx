import { permanentRedirect } from 'next/navigation';

// The beta waitlist ended when Sentinel opened to every server.
export default function Page() { permanentRedirect('/it'); }
