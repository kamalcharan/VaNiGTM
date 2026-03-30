// src/config/theme/themes/techySimple.ts
import { ThemeConfig } from '../types';

export const TechySimpleTheme: ThemeConfig = {
  id: 'techy-simple',
  name: 'Techy Simple',
  colors: {
    brand: {
      primary: '#f83b46',
      secondary: '#ff6a73',
      tertiary: '#0299ff',
      alternate: '#e0e3e7',
    },
    utility: {
      primaryText: '#141518',
      secondaryText: '#677681',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#4cf83b46',
      accent2: '#4cff6a73',
      accent3: '#4c0299ff',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#6bbd78',
      error: '#ff5963',
      warning: '#ec9c4b',
      info: '#0299ff',
    }
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#f83b46',
        secondary: '#ff6a73',
        tertiary: '#0299ff',
        alternate: '#262b36',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#141518',
        secondaryBackground: '#1a1f24',
      },
      accent: {
        accent1: '#4cf83b46',
        accent2: '#4cff6a73',
        accent3: '#4c0299ff',
        accent4: '#b3262b36',
      },
      semantic: {
        success: '#6bbd78',
        error: '#ff5963',
        warning: '#ec9c4b',
        info: '#0299ff',
      }
    }
  }
};