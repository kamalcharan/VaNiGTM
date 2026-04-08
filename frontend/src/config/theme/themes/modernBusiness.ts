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
      secondaryText: 'rgba(26,31,36,0.58)',
      primaryBackground: '#f0f6f5',         // Teal-tinted (was generic #f1f4f8)
      secondaryBackground: '#e4f0ee',
    },
    accent: {
      accent1: '#4c39d2c0',
      accent2: '#4d1aaa99',
      accent3: '#4cee8b60',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#22a870',                    // Was #165070 (dark slate-blue) — wrong colour for success
      error: '#c44454',
      warning: '#cc8e30',
      info: '#2a7abf',
    },
    surface: {
      glass: 'rgba(57,210,192,0.05)',        // Teal-tinted (was generic black)
      glassStrong: 'rgba(57,210,192,0.09)',
      glassBorder: 'rgba(57,210,192,0.16)',
      primaryDim: 'rgba(57,210,192,0.35)',
      primaryGlow: 'rgba(57,210,192,0.1)',
      primarySubtle: 'rgba(57,210,192,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#45e0cc',                  // Brighter teal for dark bg
        secondary: '#28c0aa',
        tertiary: '#f0a070',
        alternate: '#2b3238',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#1a1f24',
        secondaryBackground: '#262e38',     // FIXED: was #12161b — inverted (darker than bg)!
      },
      accent: {
        accent1: '#4c45e0cc',
        accent2: '#4d28c0aa',
        accent3: '#4cf0a070',
        accent4: '#b3262e38',
      },
      semantic: {
        success: '#3acc8a',                  // Was #165070 dark slate — wrong colour for success
        error: '#e05555',
        warning: '#e09030',
        info: '#4a90c4',
      },
      surface: {
        glass: 'rgba(69,224,204,0.07)',
        glassStrong: 'rgba(69,224,204,0.12)',
        glassBorder: 'rgba(69,224,204,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(57,210,192,0.4)',
        primaryGlow: 'rgba(57,210,192,0.15)',
        primarySubtle: 'rgba(57,210,192,0.06)',
      },
    },
  },
};
