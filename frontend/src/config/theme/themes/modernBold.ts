// src/config/theme/themes/modernBold.ts
import { ThemeConfig } from '../types';

export const ModernBoldTheme: ThemeConfig = {
  id: 'modern-bold',
  name: 'Modern & Bold',
  colors: {
    brand: {
      primary: '#19db8a',
      secondary: '#38b4ff',
      tertiary: '#ffa130',
      alternate: '#e0a3e7',
    },
    utility: {
      primaryText: '#14181b', // Fixed from #14f8fb
      secondaryText: '#576c36', // Fixed from #57c36c
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#4c19db8a', // Fixed transparency format
      accent2: '#4438b4ff', // Fixed transparency format
      accent3: '#44ffa130',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#16b070',
      error: '#ff6973', // Fixed from #ff69f3
      warning: '#cc8a30',
      info: '#38b4ff',
    },
    surface: {
      glass: 'rgba(0,0,0,0.03)',
      glassStrong: 'rgba(0,0,0,0.05)',
      glassBorder: 'rgba(0,0,0,0.08)',
      primaryDim: 'rgba(25,219,138,0.35)',
      primaryGlow: 'rgba(25,219,138,0.1)',
      primarySubtle: 'rgba(25,219,138,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#19db8a',
        secondary: '#38b4ff',
        tertiary: '#ffa130',
        alternate: '#2b32db',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#14181b',
        secondaryBackground: '#1a2429', // Fixed from #142429
      },
      accent: {
        accent1: '#4c19db8a',
        accent2: '#4438b4ff', // Fixed from #44d5d4df
        accent3: '#4cffa130',
        accent4: '#b214181b', // Fixed from #b21418ib
      },
      semantic: {
        success: '#16b070',
        error: '#ff6973', // Fixed from #fff9fd3
        warning: '#cc6b30',
        info: '#38b4ff',
      },
      surface: {
        glass: 'rgba(255,255,255,0.04)',
        glassStrong: 'rgba(255,255,255,0.07)',
        glassBorder: 'rgba(255,255,255,0.08)',
        primaryDim: 'rgba(25,219,138,0.4)',
        primaryGlow: 'rgba(25,219,138,0.15)',
        primarySubtle: 'rgba(25,219,138,0.06)',
      },
    },
  },
};