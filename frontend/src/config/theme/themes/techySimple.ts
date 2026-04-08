// src/config/theme/themes/techySimple.ts
import { ThemeConfig } from '../types';

export const TechySimpleTheme: ThemeConfig = {
  id: 'techy-simple',
  name: 'Techy Simple',
  colors: {
    brand: {
      primary: '#f83b46',
      secondary: '#ff6a73',
      tertiary: '#0299ff',
      alternate: '#e0e3e7',
    },
    utility: {
      primaryText: '#141518',
      secondaryText: 'rgba(20,21,24,0.58)',
      primaryBackground: '#faf2f2',           // Warm red-tinted (was generic #f1f4f8)
      secondaryBackground: '#f4e8e8',
    },
    accent: {
      accent1: '#4cf83b46',
      accent2: '#4cff6a73',
      accent3: '#4c0299ff',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#6bbd78',
      error: '#ff5963',
      warning: '#ec9c4b',
      info: '#0299ff',
    },
    surface: {
      glass: 'rgba(248,59,70,0.05)',          // Red-tinted (was generic black)
      glassStrong: 'rgba(248,59,70,0.09)',
      glassBorder: 'rgba(248,59,70,0.16)',
      primaryDim: 'rgba(248,59,70,0.35)',
      primaryGlow: 'rgba(248,59,70,0.1)',
      primarySubtle: 'rgba(248,59,70,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#ff5060',                   // Slightly brighter red for dark bg
        secondary: '#ff8088',
        tertiary: '#30aaff',
        alternate: '#262b36',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#141518',
        secondaryBackground: '#252936',       // Clearly lifted (was #1a1f24 — close delta)
      },
      accent: {
        accent1: '#4cff5060',
        accent2: '#4cff8088',
        accent3: '#4c30aaff',
        accent4: '#b3252936',
      },
      semantic: {
        success: '#6bbd78',
        error: '#ff5963',
        warning: '#ec9c4b',
        info: '#30aaff',
      },
      surface: {
        glass: 'rgba(255,80,96,0.07)',
        glassStrong: 'rgba(255,80,96,0.12)',
        glassBorder: 'rgba(255,80,96,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(248,59,70,0.4)',
        primaryGlow: 'rgba(248,59,70,0.15)',
        primarySubtle: 'rgba(248,59,70,0.06)',
      },
    },
  },
};
