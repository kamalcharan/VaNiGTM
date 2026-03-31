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
      alternate: '#dfe3e7',
    },
    utility: {
      primaryText: '#1a1f24',
      secondaryText: '#656a85',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#4c39d2c0',
      accent2: '#4d1aaa99',
      accent3: '#4cee8b60',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#165070',
      error: '#c44454',
      warning: '#cc8e30',
      info: '#39d2c0',
    },
    surface: {
      glass: 'rgba(0,0,0,0.03)',
      glassStrong: 'rgba(0,0,0,0.05)',
      glassBorder: 'rgba(0,0,0,0.08)',
      primaryDim: 'rgba(57,210,192,0.35)',
      primaryGlow: 'rgba(57,210,192,0.1)',
      primarySubtle: 'rgba(57,210,192,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#39d2c0',
        secondary: '#1aaa99',
        tertiary: '#ee8b60',
        alternate: '#2b3238',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#1a1f24',
        secondaryBackground: '#12161b',
      },
      accent: {
        accent1: '#4c39d2c0',
        accent2: '#4d1aaa99',
        accent3: '#4cee8b60',
        accent4: '#b32b3238',
      },
      semantic: {
        success: '#165070',
        error: '#c44454',
        warning: '#cc8e30',
        info: '#39d2c0',
      },
      surface: {
        glass: 'rgba(255,255,255,0.04)',
        glassStrong: 'rgba(255,255,255,0.07)',
        glassBorder: 'rgba(255,255,255,0.08)',
        primaryDim: 'rgba(57,210,192,0.4)',
        primaryGlow: 'rgba(57,210,192,0.15)',
        primarySubtle: 'rgba(57,210,192,0.06)',
      },
    },
  },
};