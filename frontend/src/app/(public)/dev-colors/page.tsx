'use client';

/**
 * /dev-colors — Theme color swatch debug page
 * Shows primaryBackground + secondaryBackground for all 14 themes.
 * No auth required.
 */

import { themes } from '@/config/theme/registry';

export default function DevColorsPage() {
  return (
    <div style={{ padding: '40px', fontFamily: 'DM Sans, sans-serif', background: '#111', minHeight: '100vh' }}>
      <h1 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Theme Color Debug
      </h1>
      <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '40px' }}>
        primaryBackground · secondaryBackground · brand.primary · brand.secondary
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
        {themes.map(theme => {
          const c = theme.colors;
          const dc = theme.darkMode.colors;
          return (
            <div key={theme.id} style={{ border: '1px solid #333', borderRadius: '14px', overflow: 'hidden' }}>
              {/* Theme name */}
              <div style={{ padding: '12px 16px', background: '#1a1a1a', borderBottom: '1px solid #333' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>{theme.name}</span>
                <span style={{ color: '#555', fontSize: '0.7rem', marginLeft: '10px' }}>{theme.id}</span>
              </div>

              {/* Light mode — page bg = primaryBackground, cards = secondaryBackground */}
              <div style={{ padding: '16px', background: c.utility.primaryBackground }}>
                <div style={{ color: c.utility.secondaryText, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>Light mode</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Swatch label="primaryBg" color={c.utility.primaryBackground} />
                  <Swatch label="secondaryBg" color={c.utility.secondaryBackground} />
                  <Swatch label="brand.primary" color={c.brand.primary} />
                  <Swatch label="brand.secondary" color={c.brand.secondary} />
                </div>

                {/* Live card preview — light (secondaryBackground = card surface) */}
                <div style={{ marginTop: '14px', padding: '16px', background: c.utility.secondaryBackground, borderRadius: '10px', border: `1px solid ${c.surface?.glassBorder ?? '#ddd'}` }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.utility.secondaryText, marginBottom: '10px' }}>
                    Personal Details
                  </div>
                  <Row label="Full Name" value="Sri Charan Kamal" fg={c.utility.primaryText} muted={c.utility.secondaryText} />
                  <Row label="Primary Mobile" value="+919885164233" fg={c.brand.primary} muted={c.utility.secondaryText} mono />
                  <Row label="Added" value="7 Apr 2026" fg={c.utility.primaryText} muted={c.utility.secondaryText} />
                </div>

                {/* Channel item preview */}
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: c.brand.primary, borderRadius: '10px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `color-mix(in srgb, ${c.utility.primaryBackground} 18%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <PhoneIcon color={c.utility.primaryBackground} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: `${c.utility.primaryBackground}99` }}>mobile</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: c.utility.primaryBackground, fontFamily: 'monospace' }}>+919885164233</div>
                  </div>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: c.utility.primaryBackground, background: `${c.utility.primaryBackground}33`, padding: '3px 7px', borderRadius: '4px' }}>Primary</span>
                </div>
              </div>

              {/* Dark mode */}
              <div style={{ padding: '16px', background: '#111', borderTop: '1px solid #333' }}>
                <div style={{ color: '#888', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>Dark mode</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Swatch label="primaryBg" color={dc.utility.primaryBackground} />
                  <Swatch label="secondaryBg" color={dc.utility.secondaryBackground} />
                  <Swatch label="brand.primary" color={dc.brand.primary} />
                  <Swatch label="brand.secondary" color={dc.brand.secondary} />
                </div>

                {/* Live card preview — dark (secondaryBackground = card surface) */}
                <div style={{ marginTop: '14px', padding: '16px', background: dc.utility.secondaryBackground, borderRadius: '10px', border: `1px solid ${dc.surface?.glassBorder ?? '#333'}` }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: dc.utility.secondaryText, marginBottom: '10px' }}>
                    Personal Details
                  </div>
                  <Row label="Full Name" value="Sri Charan Kamal" fg={dc.utility.primaryText} muted={dc.utility.secondaryText} />
                  <Row label="Primary Mobile" value="+919885164233" fg={dc.brand.primary} muted={dc.utility.secondaryText} mono />
                  <Row label="Added" value="7 Apr 2026" fg={dc.utility.primaryText} muted={dc.utility.secondaryText} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '8px',
        background: color,
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
      }} title={color} />
      <div style={{ fontSize: '0.55rem', color: '#888', textAlign: 'center', maxWidth: '52px', lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: '0.55rem', color: '#555', fontFamily: 'monospace' }}>{color}</div>
    </div>
  );
}

function Row({ label, value, fg, muted, mono }: { label: string; value: string; fg: string; muted: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
      <span style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>{label}</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 500, color: fg, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

function PhoneIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" width="13" height="13">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.2 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
    </svg>
  );
}
