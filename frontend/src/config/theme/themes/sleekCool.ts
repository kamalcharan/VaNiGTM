// src/config/theme/themes/sleekCool.ts
import { ThemeConfig } from '../types';

export const SleekCoolTheme: ThemeConfig = {
  id: 'sleek-cool',
  name: 'Sleek & Cool',
  colors: {
    brand: {
      primary: '#2797ff',
      secondary: '#0a6bc4',
      tertiary: '#acc420',
      alternate: '#dceeff',
    },
    utility: {
      primaryText: '#101620',
      secondaryText: '#506080',
      primaryBackground: '#f2f6fc',  // icy blue-white
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(39,151,255,0.15)',
      accent2: 'rgba(10,107,196,0.15)',
      accent3: 'rgba(172,196,32,0.15)',
      accent4: 'rgba(39,151,255,0.08)',
    },
    semantic: {
      success: '#2d7a4f',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#2797ff',
    },
    surface: {
      glass: 'rgba(39,151,255,0.05)',
      glassStrong: 'rgba(39,151,255,0.09)',
      glassBorder: '#ccdff8',
      primaryDim: 'rgba(39,151,255,0.25)',
      primaryGlow: 'rgba(39,151,255,0.12)',
      primarySubtle: 'rgba(39,151,255,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#50aaff',
        secondary: '#3a88e0',
        tertiary: '#c8e040',
        alternate: '#1a2438',
      },
      utility: {
        primaryText: '#eef4ff',
        secondaryText: 'rgba(238,244,255,0.65)',
        primaryBackground: '#0e1420',
        secondaryBackground: '#1a2438',
      },
      accent: {
        accent1: 'rgba(80,170,255,0.20)',
        accent2: 'rgba(58,136,224,0.18)',
        accent3: 'rgba(200,224,64,0.18)',
        accent4: 'rgba(80,170,255,0.10)',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#e0a040',
        info: '#50aaff',
      },
      surface: {
        glass: 'rgba(80,170,255,0.07)',
        glassStrong: 'rgba(80,170,255,0.12)',
        glassBorder: 'rgba(80,170,255,0.24)',
        primaryDim: 'rgba(39,151,255,0.38)',
        primaryGlow: 'rgba(39,151,255,0.16)',
        primarySubtle: 'rgba(39,151,255,0.07)',
      },
    },
  },
};
