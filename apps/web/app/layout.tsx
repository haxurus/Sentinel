import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted at build time by next/font: no runtime request to Google, so the
// strict CSP (font-src 'self') keeps working.
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'Sentinel | Discord Audit & Logging',
    template: '%s | Sentinel'
  },
  description: 'Sentinel è un sistema self-hosted di logging e auditing per Discord con storico ricercabile, routing per evento e dashboard amministrativa.',
  metadataBase: new URL('https://sentinel.haxurus.com')
};

export const viewport: Viewport = {
  themeColor: '#0a0b0d',
  colorScheme: 'dark'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
