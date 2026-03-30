// src/config/theme/themes/modernBusiness.ts
import { ThemeConfig } from '../types';

export const ModernBusinessTheme: ThemeConfig = {
  id: 'modern-business',
  name: 'Modern Business',
  colors: {
    brand: {
      primary: '#39d2c0',
      secondary: '#1aaa99',
      tertiary: '#ee8b60',
      alternate: '#dfe3e7',
    },
    utility: {
      primaryText: '#1a1f24',
      secondaryText: '#656a85',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#4c39d2c0',
      accent2: '#4d1aaa99',
      accent3: '#4cee8b60',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#165070',
      error: '#c44454',
      warning: '#cc8e30',
      info: '#39d2c0',
    }
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#39d2c0',
        secondary: '#1aaa99',
        tertiary: '#ee8b60',
        alternate: '#2b3238',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#1a1f24',
        secondaryBackground: '#12161b',
      },
      accent: {
        accent1: '#4c39d2c0',
        accent2: '#4d1aaa99',
        accent3: '#4cee8b60',
        accent4: '#b32b3238',
      },
      semantic: {
        success: '#165070',
        error: '#c44454',
        warning: '#cc8e30',
        info: '#39d2c0',
      }
    }
  }
};