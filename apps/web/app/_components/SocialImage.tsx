import { ImageResponse } from 'next/og';

export const socialImageSize = { width: 1200, height: 630 };

/** Shared Open Graph / Twitter card, rendered at build time per language. */
export function socialImage({ kicker, title, subtitle, tags }: { kicker: string; title: string; subtitle: string; tags: string[] }) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: 'linear-gradient(135deg, #0e0b16 0%, #1b1527 60%, #2c233d 100%)', color: '#f2edf8', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <path d="M16 2.5 4.5 7v8.2c0 6.9 4.7 12.3 11.5 14.3 6.8-2 11.5-7.4 11.5-14.3V7L16 2.5Z" fill="none" stroke="#f2edf8" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M8.6 15.6c2-3.3 4.5-5 7.4-5s5.4 1.7 7.4 5c-2 3.3-4.5 5-7.4 5s-5.4-1.7-7.4-5Z" fill="none" stroke="#f2edf8" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx="16" cy="15.6" r="2.4" fill="#a78bfa" />
          </svg>
          <span style={{ fontSize: 40, fontWeight: 700 }}>Sentinel</span>
          <span style={{ marginLeft: 12, padding: '6px 16px', border: '2px solid rgba(167,139,250,.5)', borderRadius: 999, color: '#c4b5fd', fontSize: 24 }}>{kicker}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{title}</span>
          <span style={{ fontSize: 32, color: '#c6bbd7', lineHeight: 1.35 }}>{subtitle}</span>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {tags.map((tag) => (
            <span key={tag} style={{ padding: '8px 18px', borderRadius: 10, background: 'rgba(167,139,250,.14)', color: '#e4dcf5', fontSize: 24 }}>{tag}</span>
          ))}
        </div>
      </div>
    ),
    socialImageSize
  );
}
