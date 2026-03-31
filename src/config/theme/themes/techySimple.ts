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
      secondaryText: '#677681',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
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
      glass: 'rgba(0,0,0,0.03)',
      glassStrong: 'rgba(0,0,0,0.05)',
      glassBorder: 'rgba(0,0,0,0.08)',
      primaryDim: 'rgba(248,59,70,0.35)',
      primaryGlow: 'rgba(248,59,70,0.1)',
      primarySubtle: 'rgba(248,59,70,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#f83b46',
        secondary: '#ff6a73',
        tertiary: '#0299ff',
        alternate: '#262b36',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#141518',
        secondaryBackground: '#1a1f24',
      },
      accent: {
        accent1: '#4cf83b46',
        accent2: '#4cff6a73',
        accent3: '#4c0299ff',
        accent4: '#b3262b36',
      },
      semantic: {
        success: '#6bbd78',
        error: '#ff5963',
        warning: '#ec9c4b',
        info: '#0299ff',
      },
      surface: {
        glass: 'rgba(255,255,255,0.04)',
        glassStrong: 'rgba(255,255,255,0.07)',
        glassBorder: 'rgba(255,255,255,0.08)',
        primaryDim: 'rgba(248,59,70,0.4)',
        primaryGlow: 'rgba(248,59,70,0.15)',
        primarySubtle: 'rgba(248,59,70,0.06)',
      },
    },
  },
};