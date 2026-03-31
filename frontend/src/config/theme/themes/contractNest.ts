// src/config/theme/themes/contractNest.ts
import { ThemeConfig } from '../types';

export const ContractNestTheme: ThemeConfig = {
  id: 'contract-nest',
  name: 'Contract Nest',
  colors: {
    brand: {
      primary: '#E53E3E',  // Red from your logo (keeping this as an accent)
      secondary: '#000000', // Pure black
      tertiary: '#757575',  // Mid gray
      alternate: '#F5F5F5',  // Very light gray
    },
    utility: {
      primaryText: '#000000',  // Pure black
      secondaryText: '#525252', // Dark gray
      primaryBackground: '#FFFFFF', // Pure white
      secondaryBackground: '#F5F5F5', // Very light gray
    },
    accent: {
      accent1: '#E53E3E', // Red accent
      accent2: '#000000', // Black
      accent3: '#BBBBBB', // Light gray
      accent4: '#F0F0F0', // Very light gray
    },
    semantic: {
      success: '#2E7D32', // Green
      error: '#E53E3E',   // Red
      warning: '#F57C00', // Orange
      info: '#0277BD',    // Blue
    },
    surface: {
      glass: 'rgba(0,0,0,0.03)',
      glassStrong: 'rgba(0,0,0,0.05)',
      glassBorder: 'rgba(0,0,0,0.08)',
      primaryDim: 'rgba(229,62,62,0.35)',
      primaryGlow: 'rgba(229,62,62,0.1)',
      primarySubtle: 'rgba(229,62,62,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#F56565',  // Brighter red for dark mode
        secondary: '#FFFFFF', // Pure white
        tertiary: '#AAAAAA',  // Light gray
        alternate: '#1F1F1F',  // Very dark gray
      },
      utility: {
        primaryText: '#FFFFFF', // Pure white
        secondaryText: '#BBBBBB', // Light gray
        primaryBackground: '#000000', // Pure black
        secondaryBackground: '#1F1F1F', // Very dark gray
      },
      accent: {
        accent1: '#FF6B6B', // Lighter red
        accent2: '#FFFFFF', // White
        accent3: '#888888', // Mid gray
        accent4: '#333333', // Dark gray
      },
      semantic: {
        success: '#66BB6A', // Green
        error: '#EF5350',   // Red
        warning: '#FFA726', // Orange
        info: '#42A5F5',    // Blue
      },
      surface: {
        glass: 'rgba(255,255,255,0.04)',
        glassStrong: 'rgba(255,255,255,0.07)',
        glassBorder: 'rgba(255,255,255,0.08)',
        primaryDim: 'rgba(245,101,101,0.4)',
        primaryGlow: 'rgba(245,101,101,0.15)',
        primarySubtle: 'rgba(245,101,101,0.06)',
      },
    },
  },
};