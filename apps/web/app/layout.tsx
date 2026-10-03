import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Sentinel | Discord Audit & Logging',
    template: '%s | Sentinel'
  },
  description: 'Sentinel è un sistema self-hosted di logging e auditing per Discord con storico ricercabile, routing per evento e dashboard amministrativa.',
  metadataBase: new URL('https://sentinel.haxurus.com')
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
