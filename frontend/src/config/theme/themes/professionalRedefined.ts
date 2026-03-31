// src/config/theme/themes/professionalRedefined.ts
import { ThemeConfig } from '../types';

export const ProfessionalRedefinedTheme: ThemeConfig = {
  id: 'professional-redefined',
  name: 'Professional Redefined',
  colors: {
    brand: {
      primary: '#507583',
      secondary: '#18aa99',
      tertiary: '#928163',
      alternate: '#ede8df',
    },
    utility: {
      primaryText: '#101518',
      secondaryText: '#576363',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#4c507583',
      accent2: '#4c18aa99',
      accent3: '#4c928163',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#16857b',
      error: '#c44454',
      warning: '#f3c344',
      info: '#507583',
    },
    surface: {
      glass: 'rgba(0,0,0,0.03)',
      glassStrong: 'rgba(0,0,0,0.05)',
      glassBorder: 'rgba(0,0,0,0.08)',
      primaryDim: 'rgba(80,117,131,0.35)',
      primaryGlow: 'rgba(80,117,131,0.1)',
      primarySubtle: 'rgba(80,117,131,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#507583',
        secondary: '#18aa99',
        tertiary: '#928163',
        alternate: '#2f2b26',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#101518',
        secondaryBackground: '#181c1f',
      },
      accent: {
        accent1: '#4c507583',
        accent2: '#4c18aa99',
        accent3: '#4c928163',
        accent4: '#b32f2b26',
      },
      semantic: {
        success: '#16857b',
        error: '#c44454',
        warning: '#f3c344',
        info: '#507583',
      },
      surface: {
        glass: 'rgba(255,255,255,0.04)',
        glassStrong: 'rgba(255,255,255,0.07)',
        glassBorder: 'rgba(255,255,255,0.08)',
        primaryDim: 'rgba(80,117,131,0.4)',
        primaryGlow: 'rgba(80,117,131,0.15)',
        primarySubtle: 'rgba(80,117,131,0.06)',
      },
    },
  },
};