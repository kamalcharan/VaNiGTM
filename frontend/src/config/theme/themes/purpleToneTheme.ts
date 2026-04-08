import { ThemeConfig } from '../types';

export const PurpleToneTheme: ThemeConfig = {
  id: 'purple-tone',
  name: 'Purple Tone',
  colors: {
    brand: {
      primary: '#6f61ef',
      secondary: '#4a3f8c',
      tertiary: '#984bb6',
      alternate: '#ebe8fa',
    },
    utility: {
      primaryText: '#18161e',
      secondaryText: '#6a6478',
      primaryBackground: '#f7f5ff',  // very subtle lavender tint
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(111,97,239,0.15)',
      accent2: 'rgba(74,63,140,0.15)',
      accent3: 'rgba(152,75,182,0.15)',
      accent4: 'rgba(111,97,239,0.08)',
    },
    semantic: {
      success: '#2d7a4f',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#4a7abf',
    },
    surface: {
      glass: 'rgba(111,97,239,0.05)',
      glassStrong: 'rgba(111,97,239,0.09)',
      glassBorder: '#e2dff4',
      primaryDim: 'rgba(111,97,239,0.25)',
      primaryGlow: 'rgba(111,97,239,0.12)',
      primarySubtle: 'rgba(111,97,239,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#8878f5',
        secondary: '#6a5fc0',
        tertiary: '#b060d0',
        alternate: '#25273a',
      },
      utility: {
        primaryText: '#f0eeff',
        secondaryText: 'rgba(240,238,255,0.65)',
        primaryBackground: '#151616',
        secondaryBackground: '#25273a',
      },
      accent: {
        accent1: 'rgba(136,120,245,0.20)',
        accent2: 'rgba(106,95,192,0.18)',
        accent3: 'rgba(176,96,208,0.18)',
        accent4: 'rgba(136,120,245,0.10)',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#e09030',
        info: '#6090d8',
      },
      surface: {
        glass: 'rgba(136,120,245,0.07)',
        glassStrong: 'rgba(136,120,245,0.12)',
        glassBorder: 'rgba(136,120,245,0.24)',
        primaryDim: 'rgba(111,97,239,0.38)',
        primaryGlow: 'rgba(111,97,239,0.16)',
        primarySubtle: 'rgba(111,97,239,0.07)',
      },
    },
  },
};
