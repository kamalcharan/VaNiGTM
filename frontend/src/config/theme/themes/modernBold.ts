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
      primaryText: '#14181b',
      secondaryText: 'rgba(20,24,27,0.58)',  // Was #576c36 (olive) — wrong
      primaryBackground: '#f0f8f4',           // Mint-tinted (was generic #f1f4f8)
      secondaryBackground: '#e4f2ec',
    },
    accent: {
      accent1: '#4c19db8a',
      accent2: '#4438b4ff',
      accent3: '#44ffa130',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#16b070',
      error: '#ff6973',
      warning: '#cc8a30',
      info: '#38b4ff',
    },
    surface: {
      glass: 'rgba(25,219,138,0.05)',        // Green-tinted (was generic black)
      glassStrong: 'rgba(25,219,138,0.09)',
      glassBorder: 'rgba(25,219,138,0.16)',
      primaryDim: 'rgba(25,219,138,0.35)',
      primaryGlow: 'rgba(25,219,138,0.1)',
      primarySubtle: 'rgba(25,219,138,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#22e898',                  // Slightly brighter for dark bg
        secondary: '#50c4ff',
        tertiary: '#ffb850',
        alternate: '#1c2230',               // Was #2b32db (bright blue) — wrong for dark surface
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#14181b',
        secondaryBackground: '#202e38',     // Clearly lifted (was #1a2429 — close delta)
      },
      accent: {
        accent1: '#4c22e898',
        accent2: '#4450c4ff',
        accent3: '#4cffb850',
        accent4: '#b21c2230',
      },
      semantic: {
        success: '#22e898',
        error: '#ff6973',
        warning: '#cc6b30',
        info: '#50c4ff',
      },
      surface: {
        glass: 'rgba(34,232,152,0.07)',
        glassStrong: 'rgba(34,232,152,0.12)',
        glassBorder: 'rgba(34,232,152,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(25,219,138,0.4)',
        primaryGlow: 'rgba(25,219,138,0.15)',
        primarySubtle: 'rgba(25,219,138,0.06)',
      },
    },
  },
};
