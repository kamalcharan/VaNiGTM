import { ThemeConfig } from '../types';

export const PurpleToneTheme: ThemeConfig = {
  id: 'purple-tone',
  name: 'Purple Tone',
  colors: {
    brand: {
      primary: '#6f61ef',
      secondary: '#392d2c',
      tertiary: '#984bb6',
      alternate: '#e0e3e7',
    },
    utility: {
      primaryText: '#151616',
      secondaryText: '#606e85',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#4d9489f5',
      accent2: '#4d392d2c',
      accent3: '#4d6469f5',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#24a891',
      error: '#ff5963',
      warning: '#fcdc0c',
      info: '#ffffff',
    }
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#6f61ef',
        secondary: '#392d2c0',
        tertiary: '#9984bb6',
        alternate: '#313442',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#151616',
        secondaryBackground: '#1a1f24',
      },
      accent: {
        accent1: '#4d9489f5',
        accent2: '#4d392d2c0',
        accent3: '#4d6469f5',
        accent4: '#b3313442',
      },
      semantic: {
        success: '#24a891',
        error: '#ff5963',
        warning: '#fcdc0c',
        info: '#ffffff',
      }
    }
  }
};