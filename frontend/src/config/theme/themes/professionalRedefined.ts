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
      alternate: '#e2ecee',
    },
    utility: {
      primaryText: '#101a1e',
      secondaryText: '#5a7078',
      primaryBackground: '#f4f7f8',  // cool slate-white — corporate calm
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(80,117,131,0.15)',
      accent2: 'rgba(24,170,153,0.15)',
      accent3: 'rgba(146,129,99,0.15)',
      accent4: 'rgba(80,117,131,0.08)',
    },
    semantic: {
      success: '#2d7a5a',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#2a6a9a',
    },
    surface: {
      glass: 'rgba(80,117,131,0.05)',
      glassStrong: 'rgba(80,117,131,0.09)',
      glassBorder: '#d8e4e8',
      primaryDim: 'rgba(80,117,131,0.25)',
      primaryGlow: 'rgba(80,117,131,0.10)',
      primarySubtle: 'rgba(80,117,131,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#6fa0b2',
        secondary: '#28c0aa',
        tertiary: '#b09878',
        alternate: '#1c2e38',
      },
      utility: {
        primaryText: '#ecf4f8',
        secondaryText: 'rgba(236,244,248,0.65)',
        primaryBackground: '#0c1418',
        secondaryBackground: '#1c2e38',
      },
      accent: {
        accent1: 'rgba(111,160,178,0.20)',
        accent2: 'rgba(40,192,170,0.18)',
        accent3: 'rgba(176,152,120,0.18)',
        accent4: 'rgba(111,160,178,0.10)',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#e0a040',
        info: '#4a90c4',
      },
      surface: {
        glass: 'rgba(111,160,178,0.07)',
        glassStrong: 'rgba(111,160,178,0.12)',
        glassBorder: 'rgba(111,160,178,0.24)',
        primaryDim: 'rgba(80,117,131,0.38)',
        primaryGlow: 'rgba(80,117,131,0.16)',
        primarySubtle: 'rgba(80,117,131,0.07)',
      },
    },
  },
};
