import { ImageResponse } from 'next/og';
import { BRAND_ICON_DATA_URI } from './brand-icon';

export const socialImageSize = { width: 1200, height: 630 };

/** Shared Open Graph / Twitter card, rendered at build time per language. */
export function socialImage({ kicker, title, subtitle, tags }: { kicker: string; title: string; subtitle: string; tags: string[] }) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: 'linear-gradient(135deg, #0e0b16 0%, #1b1527 60%, #2c233d 100%)', color: '#f2edf8', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img src={BRAND_ICON_DATA_URI} width={72} height={72} style={{ borderRadius: 16 }} alt="" />
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
