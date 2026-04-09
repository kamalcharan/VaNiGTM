// src/config/theme/themes/modernBusiness.ts
import { ThemeConfig } from '../types';

export const ModernBusinessTheme: ThemeConfig = {
  id: 'modern-business',
  name: 'Modern Business',
  colors: {
    brand: {
      primary: '#39d2c0',
      secondary: '#1aaa99',
      tertiary: '#ee8b60',
      alternate: '#d8f4f1',
    },
    utility: {
      primaryText: '#111e1c',
      secondaryText: '#567870',
      primaryBackground: '#f2f9f8',  // very subtle teal tint
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(57,210,192,0.15)',
      accent2: 'rgba(26,170,153,0.15)',
      accent3: 'rgba(238,139,96,0.15)',
      accent4: 'rgba(57,210,192,0.08)',
    },
    semantic: {
      success: '#2d8a6a',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#2a7abf',
    },
    surface: {
      glass: 'rgba(57,210,192,0.05)',
      glassStrong: 'rgba(57,210,192,0.09)',
      glassBorder: '#cceee9',
      primaryDim: 'rgba(57,210,192,0.25)',
      primaryGlow: 'rgba(57,210,192,0.12)',
      primarySubtle: 'rgba(57,210,192,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#45e0cc',
        secondary: '#28c0aa',
        tertiary: '#f0a070',
        alternate: '#1a2e2c',
      },
      utility: {
        primaryText: '#ecfaf8',
        secondaryText: 'rgba(236,250,248,0.65)',
        primaryBackground: '#0e1a18',
        secondaryBackground: '#1a2e2c',
      },
      accent: {
        accent1: 'rgba(69,224,204,0.20)',
        accent2: 'rgba(40,192,170,0.18)',
        accent3: 'rgba(240,160,112,0.18)',
        accent4: 'rgba(69,224,204,0.10)',
      },
      semantic: {
        success: '#3acc8a',
        error: '#e05555',
        warning: '#e09030',
        info: '#4a90c4',
      },
      surface: {
        glass: 'rgba(69,224,204,0.07)',
        glassStrong: 'rgba(69,224,204,0.12)',
        glassBorder: 'rgba(69,224,204,0.24)',
        primaryDim: 'rgba(57,210,192,0.38)',
        primaryGlow: 'rgba(57,210,192,0.16)',
        primarySubtle: 'rgba(57,210,192,0.07)',
      },
    },
  },
};
