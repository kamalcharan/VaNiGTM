// src/config/theme/themes/contractNest.ts
import { ThemeConfig } from '../types';

export const ContractNestTheme: ThemeConfig = {
  id: 'contract-nest',
  name: 'Contract Nest',
  colors: {
    brand: {
      primary: '#E53E3E',
      secondary: '#111111',
      tertiary: '#888888',
      alternate: '#f5f5f5',
    },
    utility: {
      primaryText: '#111111',
      secondaryText: '#6b6b6b',
      primaryBackground: '#f8f8f8',  // near-white with very faint warmth
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(229,62,62,0.12)',
      accent2: 'rgba(17,17,17,0.10)',
      accent3: 'rgba(229,62,62,0.07)',
      accent4: 'rgba(17,17,17,0.05)',
    },
    semantic: {
      success: '#2E7D32',
      error: '#E53E3E',
      warning: '#F57C00',
      info: '#0277BD',
    },
    surface: {
      glass: 'rgba(229,62,62,0.04)',
      glassStrong: 'rgba(229,62,62,0.08)',
      glassBorder: '#e8e8e8',
      primaryDim: 'rgba(229,62,62,0.22)',
      primaryGlow: 'rgba(229,62,62,0.10)',
      primarySubtle: 'rgba(229,62,62,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#F56565',
        secondary: '#f0f0f0',
        tertiary: '#aaaaaa',
        alternate: '#222222',
      },
      utility: {
        primaryText: '#f8f8f8',
        secondaryText: 'rgba(248,248,248,0.65)',
        primaryBackground: '#0a0a0a',
        secondaryBackground: '#222222',
      },
      accent: {
        accent1: 'rgba(245,101,101,0.18)',
        accent2: 'rgba(240,240,240,0.10)',
        accent3: 'rgba(245,101,101,0.12)',
        accent4: 'rgba(240,240,240,0.06)',
      },
      semantic: {
        success: '#66BB6A',
        error: '#EF5350',
        warning: '#FFA726',
        info: '#42A5F5',
      },
      surface: {
        glass: 'rgba(245,101,101,0.07)',
        glassStrong: 'rgba(245,101,101,0.12)',
        glassBorder: 'rgba(245,101,101,0.24)',
        primaryDim: 'rgba(245,101,101,0.38)',
        primaryGlow: 'rgba(245,101,101,0.16)',
        primarySubtle: 'rgba(245,101,101,0.07)',
      },
    },
  },
};
