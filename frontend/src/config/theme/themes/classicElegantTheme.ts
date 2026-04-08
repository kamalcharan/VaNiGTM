import { ThemeConfig } from '../types';

export const ClassicElegantTheme: ThemeConfig = {
  id: 'classic-elegant',
  name: 'Classic & Elegant',
  colors: {
    brand: {
      primary: '#4b998c',
      secondary: '#928163',
      tertiary: '#c6604a',
      alternate: '#e4eeec',
    },
    utility: {
      primaryText: '#0f1e1c',
      secondaryText: '#617870',
      primaryBackground: '#f4f7f6',  // very subtle sage-teal tint
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(75,153,140,0.15)',
      accent2: 'rgba(146,129,99,0.15)',
      accent3: 'rgba(198,96,74,0.15)',
      accent4: 'rgba(75,153,140,0.08)',
    },
    semantic: {
      success: '#2d7a5a',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#2a6b8a',
    },
    surface: {
      glass: 'rgba(75,153,140,0.05)',
      glassStrong: 'rgba(75,153,140,0.09)',
      glassBorder: '#dde8e5',
      primaryDim: 'rgba(75,153,140,0.25)',
      primaryGlow: 'rgba(75,153,140,0.10)',
      primarySubtle: 'rgba(75,153,140,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#5ab8aa',
        secondary: '#a89470',
        tertiary: '#d87a5a',
        alternate: '#1e3040',
      },
      utility: {
        primaryText: '#eef4f2',
        secondaryText: 'rgba(238,244,242,0.65)',
        primaryBackground: '#0b191e',
        secondaryBackground: '#1e3040',
      },
      accent: {
        accent1: 'rgba(90,184,170,0.18)',
        accent2: 'rgba(168,148,112,0.18)',
        accent3: 'rgba(216,122,90,0.18)',
        accent4: 'rgba(90,184,170,0.10)',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#e0a040',
        info: '#4a90c4',
      },
      surface: {
        glass: 'rgba(90,184,170,0.07)',
        glassStrong: 'rgba(90,184,170,0.12)',
        glassBorder: 'rgba(90,184,170,0.24)',
        primaryDim: 'rgba(75,153,140,0.38)',
        primaryGlow: 'rgba(75,153,140,0.16)',
        primarySubtle: 'rgba(75,153,140,0.07)',
      },
    },
  },
};
