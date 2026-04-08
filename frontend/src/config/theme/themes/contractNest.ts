// src/config/theme/themes/contractNest.ts
import { ThemeConfig } from '../types';

export const ContractNestTheme: ThemeConfig = {
  id: 'contract-nest',
  name: 'Contract Nest',
  colors: {
    brand: {
      primary: '#E53E3E',
      secondary: '#000000',
      tertiary: '#757575',
      alternate: '#F5F5F5',
    },
    utility: {
      primaryText: '#000000',
      secondaryText: 'rgba(0,0,0,0.58)',
      primaryBackground: '#FFFFFF',
      secondaryBackground: '#F5F5F5',
    },
    accent: {
      accent1: '#E53E3E',
      accent2: '#000000',
      accent3: '#BBBBBB',
      accent4: '#F0F0F0',
    },
    semantic: {
      success: '#2E7D32',
      error: '#E53E3E',
      warning: '#F57C00',
      info: '#0277BD',
    },
    surface: {
      glass: 'rgba(229,62,62,0.04)',        // Red-tinted (was generic black)
      glassStrong: 'rgba(229,62,62,0.08)',
      glassBorder: 'rgba(229,62,62,0.16)',
      primaryDim: 'rgba(229,62,62,0.35)',
      primaryGlow: 'rgba(229,62,62,0.1)',
      primarySubtle: 'rgba(229,62,62,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#F56565',
        secondary: '#FFFFFF',
        tertiary: '#AAAAAA',
        alternate: '#1F1F1F',
      },
      utility: {
        primaryText: '#FFFFFF',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#000000',
        secondaryBackground: '#2A2A2A',     // Slightly more lifted (was #1F1F1F — ok delta but more is better)
      },
      accent: {
        accent1: '#FF6B6B',
        accent2: '#FFFFFF',
        accent3: '#888888',
        accent4: '#333333',
      },
      semantic: {
        success: '#66BB6A',
        error: '#EF5350',
        warning: '#FFA726',
        info: '#42A5F5',
      },
      surface: {
        glass: 'rgba(245,101,101,0.06)',
        glassStrong: 'rgba(245,101,101,0.11)',
        glassBorder: 'rgba(245,101,101,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(245,101,101,0.4)',
        primaryGlow: 'rgba(245,101,101,0.15)',
        primarySubtle: 'rgba(245,101,101,0.06)',
      },
    },
  },
};
