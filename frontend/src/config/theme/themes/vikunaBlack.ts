import { ThemeConfig } from '../types';

export const VikunaBlackTheme: ThemeConfig = {
  id: 'vikuna-black',
  name: 'Vikuna Black',
  colors: {
    brand: {
      primary: '#B8942F',
      secondary: '#1A1A1F',
      tertiary: '#6B6555',
      alternate: '#EDE9E0',
    },
    utility: {
      primaryText: '#1A1A1F',
      secondaryText: '#6B6862',
      primaryBackground: '#F5F2EB',  // warm parchment
      secondaryBackground: '#ffffff', // white cards on parchment
    },
    accent: {
      accent1: 'rgba(184,148,47,0.18)',
      accent2: 'rgba(26,26,31,0.12)',
      accent3: 'rgba(212,113,112,0.18)',
      accent4: 'rgba(122,111,212,0.14)',
    },
    semantic: {
      success: '#2d7a4f',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#2a5f8a',
    },
    surface: {
      glass: 'rgba(184,148,47,0.05)',
      glassStrong: 'rgba(184,148,47,0.09)',
      glassBorder: '#e8e3d6',
      primaryDim: 'rgba(184,148,47,0.28)',
      primaryGlow: 'rgba(184,148,47,0.12)',
      primarySubtle: 'rgba(184,148,47,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#C9A84C',
        secondary: '#F0ECE2',
        tertiary: '#8A8270',
        alternate: '#1A1A24',
      },
      utility: {
        primaryText: '#F0ECE2',
        secondaryText: 'rgba(240,236,226,0.65)',
        primaryBackground: '#0A0A0F',
        secondaryBackground: '#1A1A24',
      },
      accent: {
        accent1: 'rgba(201,168,76,0.20)',
        accent2: 'rgba(240,236,226,0.10)',
        accent3: 'rgba(232,139,139,0.20)',
        accent4: 'rgba(155,143,232,0.18)',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#e8b44c',
        info: '#5eaaf0',
      },
      surface: {
        glass: 'rgba(201,168,76,0.07)',
        glassStrong: 'rgba(201,168,76,0.12)',
        glassBorder: 'rgba(201,168,76,0.24)',
        primaryDim: 'rgba(201,168,76,0.38)',
        primaryGlow: 'rgba(201,168,76,0.16)',
        primarySubtle: 'rgba(201,168,76,0.07)',
      },
    },
  },
};
