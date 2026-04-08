// src/config/theme/themes/professionalRedefined.ts
import { ThemeConfig } from '../types';

export const ProfessionalRedefinedTheme: ThemeConfig = {
  id: 'professional-redefined',
  name: 'Professional Redefined',
  colors: {
    brand: {
      primary: '#507583',
      secondary: '#18aa99',
      tertiary: '#928163',
      alternate: '#ede8df',
    },
    utility: {
      primaryText: '#101518',
      secondaryText: 'rgba(16,21,24,0.58)',
      primaryBackground: '#f2f4f3',          // Subtle sage-tint (was generic #f1f4f8)
      secondaryBackground: '#e8edea',
    },
    accent: {
      accent1: '#4c507583',
      accent2: '#4c18aa99',
      accent3: '#4c928163',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#16857b',
      error: '#c44454',
      warning: '#f3c344',
      info: '#2a6a9a',                        // Was #507583 (primary) — info should be distinct
    },
    surface: {
      glass: 'rgba(80,117,131,0.05)',         // Slate-teal tinted (was generic black)
      glassStrong: 'rgba(80,117,131,0.09)',
      glassBorder: 'rgba(80,117,131,0.16)',
      primaryDim: 'rgba(80,117,131,0.35)',
      primaryGlow: 'rgba(80,117,131,0.1)',
      primarySubtle: 'rgba(80,117,131,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#6fa0b2',                   // Brighter — was #507583 (~3.3:1 contrast on dark bg)
        secondary: '#28c0aa',
        tertiary: '#b09878',
        alternate: '#2f2b26',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#101518',
        secondaryBackground: '#22303a',       // Clearly lifted (was #181c1f — close delta)
      },
      accent: {
        accent1: '#4c6fa0b2',
        accent2: '#4c28c0aa',
        accent3: '#4cb09878',
        accent4: '#b32f2b26',
      },
      semantic: {
        success: '#28a888',
        error: '#e05555',
        warning: '#f3c344',
        info: '#4a90c4',                      // Was #507583 — now proper blue info
      },
      surface: {
        glass: 'rgba(111,160,178,0.07)',
        glassStrong: 'rgba(111,160,178,0.12)',
        glassBorder: 'rgba(111,160,178,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(80,117,131,0.4)',
        primaryGlow: 'rgba(80,117,131,0.15)',
        primarySubtle: 'rgba(80,117,131,0.06)',
      },
    },
  },
};
