import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import '../globals.css';

// Self-hosted at build time by next/font: no runtime request to Google, so the
// strict CSP (font-src 'self') keeps working.
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

/**
 * Each language has its own root layout so that <html lang> matches the
 * content, which search engines and screen readers rely on.
 */
export function RootDocument({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    <html lang={lang} className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
