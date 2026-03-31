'use client';

import { useTheme } from '@/config/theme';

export default function SmokeTest() {
  const { themeId, theme, colorMode, setTheme, toggleColorMode, themes } = useTheme();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg)',
      color: 'var(--color-fg)',
      fontFamily: 'var(--font-body, sans-serif)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '32px',
      padding: '40px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 900,
          color: 'var(--color-primary)',
          fontFamily: 'var(--font-display, serif)',
          margin: 0,
        }}>
          ProKey
        </h1>
        <p style={{ color: 'var(--color-muted)', margin: '8px 0 0' }}>
          Smoke Test — Theme System Working
        </p>
      </div>

      {/* Current theme info */}
      <div style={{
        padding: '24px 32px',
        background: 'var(--glass)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        backdropFilter: 'blur(20px)',
        textAlign: 'center',
        minWidth: '300px',
      }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          Active Theme
        </p>
        <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-fg)', margin: 0 }}>
          {theme.name}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
          {colorMode} mode
        </p>
      </div>

      {/* Color swatches */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Primary', v: '--color-primary' },
          { label: 'Accent', v: '--color-accent' },
          { label: 'Accent2', v: '--color-accent2' },
          { label: 'Accent3', v: '--color-accent3' },
          { label: 'Accent4', v: '--color-accent4' },
          { label: 'Success', v: '--color-success' },
          { label: 'Danger', v: '--color-danger' },
          { label: 'Warning', v: '--color-warning' },
          { label: 'Info', v: '--color-info' },
          { label: 'Glass', v: '--glass' },
          { label: 'Surface', v: '--color-surface' },
          { label: 'Border', v: '--glass-border' },
        ].map(swatch => (
          <div key={swatch.v} style={{ width: '72px', textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: `var(${swatch.v})`,
              border: '1px solid var(--glass-border)',
              margin: '0 auto 6px',
            }} />
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{swatch.label}</span>
          </div>
        ))}
      </div>

      {/* Theme switcher */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        maxWidth: '500px',
        width: '100%',
      }}>
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            style={{
              padding: '10px 8px',
              background: t.id === themeId ? 'var(--color-primary)' : 'var(--glass)',
              color: t.id === themeId ? 'var(--color-primary-fg)' : 'var(--color-fg)',
              border: `1px solid ${t.id === themeId ? 'var(--color-primary)' : 'var(--glass-border)'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: t.id === themeId ? 700 : 400,
              transition: 'all 200ms',
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Dark/Light toggle */}
      <button
        onClick={toggleColorMode}
        style={{
          padding: '12px 32px',
          background: 'var(--glass)',
          color: 'var(--color-fg)',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '0.85rem',
          transition: 'all 200ms',
        }}
      >
        Switch to {colorMode === 'dark' ? 'Light' : 'Dark'} Mode
      </button>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: '32px',
        color: 'var(--text-muted)',
        fontSize: '0.7rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        <span>12 Themes</span>
        <span>•</span>
        <span>21 Skill Handlers</span>
        <span>•</span>
        <span>9 Recipes</span>
      </div>
    </div>
  );
}
