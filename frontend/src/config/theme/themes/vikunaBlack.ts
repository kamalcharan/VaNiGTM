import { ThemeConfig } from '../types';

export const VikunaBlackTheme: ThemeConfig = {
  id: 'vikuna-black',
  name: 'Vikuna Black',
  colors: {
    brand: {
      primary: '#B8942F',
      secondary: '#1A1A1F',
      tertiary: '#6B6555',
      alternate: '#F5F2EB',
    },
    utility: {
      primaryText: '#1A1A1F',
      secondaryText: 'rgba(26,26,31,0.6)',
      primaryBackground: '#F5F2EB',
      secondaryBackground: '#EDE9E0',
    },
    accent: {
      accent1: '#4A8FD4',
      accent2: '#3BAFA7',
      accent3: '#D47070',
      accent4: '#7A6FD4',
    },
    semantic: {
      success: '#3BAFA7',
      error: '#D47070',
      warning: '#D4911E',
      info: '#4A8FD4',
    },
    surface: {
      glass: 'rgba(184,148,47,0.05)',
      glassStrong: 'rgba(184,148,47,0.09)',
      glassBorder: 'rgba(184,148,47,0.16)',
      primaryDim: 'rgba(184,148,47,0.35)',
      primaryGlow: 'rgba(184,148,47,0.1)',
      primarySubtle: 'rgba(184,148,47,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#C9A84C',
        secondary: '#F0ECE2',
        tertiary: '#3A3F52',
        alternate: '#111118',
      },
      utility: {
        primaryText: '#F0ECE2',
        secondaryText: 'rgba(240,236,226,0.65)',
        primaryBackground: '#0A0A0F',
        secondaryBackground: '#1A1A24',
      },
      accent: {
        accent1: '#5EAAF0',
        accent2: '#4ECDC4',
        accent3: '#E88B8B',
        accent4: '#9B8FE8',
      },
      semantic: {
        success: '#4ECDC4',
        error: '#E88B8B',
        warning: '#E8B44C',
        info: '#5EAAF0',
      },
      surface: {
        glass: 'rgba(201,168,76,0.06)',
        glassStrong: 'rgba(201,168,76,0.11)',
        glassBorder: 'rgba(201,168,76,0.22)',
        primaryDim: 'rgba(201,168,76,0.4)',
        primaryGlow: 'rgba(201,168,76,0.15)',
        primarySubtle: 'rgba(201,168,76,0.06)',
      },
    },
  },
};
