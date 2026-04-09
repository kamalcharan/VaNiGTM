// src/config/theme/themes/techySimple.ts
import { ThemeConfig } from '../types';

export const TechySimpleTheme: ThemeConfig = {
  id: 'techy-simple',
  name: 'Techy Simple',
  colors: {
    brand: {
      primary: '#f83b46',
      secondary: '#c42030',
      tertiary: '#0299ff',
      alternate: '#fde0e2',
    },
    utility: {
      primaryText: '#1a1010',
      secondaryText: '#785060',
      primaryBackground: '#fdf3f4',  // very subtle rose tint
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(248,59,70,0.15)',
      accent2: 'rgba(196,32,48,0.15)',
      accent3: 'rgba(2,153,255,0.15)',
      accent4: 'rgba(248,59,70,0.08)',
    },
    semantic: {
      success: '#2d7a4f',
      error: '#f83b46',
      warning: '#c47e1a',
      info: '#0299ff',
    },
    surface: {
      glass: 'rgba(248,59,70,0.05)',
      glassStrong: 'rgba(248,59,70,0.09)',
      glassBorder: '#f8d4d6',
      primaryDim: 'rgba(248,59,70,0.22)',
      primaryGlow: 'rgba(248,59,70,0.10)',
      primarySubtle: 'rgba(248,59,70,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#ff5060',
        secondary: '#e03040',
        tertiary: '#30aaff',
        alternate: '#2a1418',
      },
      utility: {
        primaryText: '#fff0f0',
        secondaryText: 'rgba(255,240,240,0.65)',
        primaryBackground: '#160808',
        secondaryBackground: '#2a1418',
      },
      accent: {
        accent1: 'rgba(255,80,96,0.20)',
        accent2: 'rgba(224,48,64,0.18)',
        accent3: 'rgba(48,170,255,0.18)',
        accent4: 'rgba(255,80,96,0.10)',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#ff5060',
        warning: '#e09030',
        info: '#30aaff',
      },
      surface: {
        glass: 'rgba(255,80,96,0.07)',
        glassStrong: 'rgba(255,80,96,0.12)',
        glassBorder: 'rgba(255,80,96,0.24)',
        primaryDim: 'rgba(248,59,70,0.38)',
        primaryGlow: 'rgba(248,59,70,0.16)',
        primarySubtle: 'rgba(248,59,70,0.07)',
      },
    },
  },
};
