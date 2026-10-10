import { redirect } from 'next/navigation';

// Former "still in development" page: installs now go through the beta waitlist.
export default function Page() { redirect('/it/beta'); }
