import { ThemeConfig } from '../types';

/**
 * Neural Ops — the GTM mission-control aesthetic from documents/gtm-engine-ui.
 *
 * Dark mode is the canonical identity: void background, electric-cyan primary,
 * signal-green success, steel-blue text ramp. Light mode is the "lights on"
 * counterpart (deep-cyan primary on cool white) for parity with the rest of
 * the theme system — the product default remains dark.
 *
 * Palette source: documents/gtm-engine-ui/shared/styles.css. The mockups'
 * motion/glow/grid patterns live as VDF utilities (vdf-utilities.css +
 * VdfGridOverlay), not here — themes carry tokens only.
 */
export const NeuralOpsTheme: ThemeConfig = {
  id: 'neural-ops',
  name: 'Neural Ops',
  fonts: {
    display: "'Outfit', sans-serif",
    body: "'Instrument Sans', system-ui, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  colors: {
    brand: {
      primary: '#0097a7',       // deep cyan — readable on white
      secondary: '#101828',
      tertiary: '#5a6b84',
      alternate: '#eef4f8',
    },
    utility: {
      primaryText: '#101828',
      secondaryText: '#5a6b84',
      primaryBackground: '#f4f7fa',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: 'rgba(0,151,167,0.14)',
      accent2: 'rgba(0,135,90,0.12)',
      accent3: 'rgba(217,45,32,0.12)',
      accent4: 'rgba(183,121,31,0.12)',
    },
    semantic: {
      success: '#00875a',
      error: '#d92d20',
      warning: '#b7791f',
      info: '#0086c9',
    },
    surface: {
      glass: 'rgba(0,151,167,0.05)',
      glassStrong: 'rgba(0,151,167,0.10)',
      glassBorder: '#dde5ee',
      primaryDim: 'rgba(0,151,167,0.30)',
      primaryGlow: 'rgba(0,151,167,0.12)',
      primarySubtle: 'rgba(0,151,167,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#00e5ff',     // electric cyan
        secondary: '#e8edf5',
        tertiary: '#8899b0',    // steel blue
        alternate: '#0f1319',   // surface-1
      },
      utility: {
        primaryText: '#e8edf5',
        secondaryText: '#8899b0',
        primaryBackground: '#06080c',  // void
        secondaryBackground: '#0f1319', // cards
      },
      accent: {
        accent1: 'rgba(0,229,255,0.15)',   // accent glow
        accent2: 'rgba(0,230,118,0.12)',   // signal glow
        accent3: 'rgba(255,82,82,0.10)',   // danger glow
        accent4: 'rgba(255,215,64,0.10)',  // warn glow
      },
      semantic: {
        success: '#00e676',     // signal green
        error: '#ff5252',
        warning: '#ffd740',     // warn amber
        info: '#00b8d4',        // accent dim
      },
      surface: {
        glass: 'rgba(0,229,255,0.06)',       // accent pulse
        glassStrong: 'rgba(0,229,255,0.12)',
        glassBorder: 'rgba(136,153,176,0.12)', // border default
        primaryDim: 'rgba(0,229,255,0.35)',
        primaryGlow: 'rgba(0,229,255,0.15)',
        primarySubtle: 'rgba(0,229,255,0.06)',
      },
    },
  },
};
