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
      alternate: '#dcf8ed',
    },
    utility: {
      primaryText: '#111a16',
      secondaryText: '#5a7268',
      primaryBackground: '#f2fcf7',  // subtle mint tint
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(25,219,138,0.15)',
      accent2: 'rgba(56,180,255,0.15)',
      accent3: 'rgba(255,161,48,0.15)',
      accent4: 'rgba(25,219,138,0.08)',
    },
    semantic: {
      success: '#16b070',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#2a7abf',
    },
    surface: {
      glass: 'rgba(25,219,138,0.05)',
      glassStrong: 'rgba(25,219,138,0.09)',
      glassBorder: '#d4f0e4',
      primaryDim: 'rgba(25,219,138,0.25)',
      primaryGlow: 'rgba(25,219,138,0.12)',
      primarySubtle: 'rgba(25,219,138,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#22e898',
        secondary: '#50c4ff',
        tertiary: '#ffb850',
        alternate: '#1c2230',
      },
      utility: {
        primaryText: '#edfff6',
        secondaryText: 'rgba(237,255,246,0.65)',
        primaryBackground: '#0e1814',
        secondaryBackground: '#1c2e24',
      },
      accent: {
        accent1: 'rgba(34,232,152,0.20)',
        accent2: 'rgba(80,196,255,0.18)',
        accent3: 'rgba(255,184,80,0.18)',
        accent4: 'rgba(34,232,152,0.10)',
      },
      semantic: {
        success: '#22e898',
        error: '#e05555',
        warning: '#e0a040',
        info: '#50c4ff',
      },
      surface: {
        glass: 'rgba(34,232,152,0.07)',
        glassStrong: 'rgba(34,232,152,0.12)',
        glassBorder: 'rgba(34,232,152,0.24)',
        primaryDim: 'rgba(25,219,138,0.38)',
        primaryGlow: 'rgba(25,219,138,0.16)',
        primarySubtle: 'rgba(25,219,138,0.07)',
      },
    },
  },
};
