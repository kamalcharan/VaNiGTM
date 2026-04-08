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
      secondaryText: 'rgba(21,22,22,0.58)',
      primaryBackground: '#f5f3fc',         // Purple-tinted (was generic #f1f4f8)
      secondaryBackground: '#edeaf8',
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
      warning: '#e09030',
      info: '#4a7abf',                      // Was #ffffff — invisible on light bg
    },
    surface: {
      glass: 'rgba(111,97,239,0.05)',       // Purple-tinted (was generic black)
      glassStrong: 'rgba(111,97,239,0.09)',
      glassBorder: 'rgba(111,97,239,0.16)',
      primaryDim: 'rgba(111,97,239,0.35)',
      primaryGlow: 'rgba(111,97,239,0.1)',
      primarySubtle: 'rgba(111,97,239,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#8878f5',                 // Brighter purple for dark bg (was #6f61ef — ~3.8:1)
        secondary: '#392d2c',
        tertiary: '#b060d0',                // Brighter violet
        alternate: '#313442',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#151616',
        secondaryBackground: '#25273a',     // Clearly lifted + purple-tinted (was #1a1f24)
      },
      accent: {
        accent1: '#4d9489f5',
        accent2: '#4d392d2c',
        accent3: '#4d6469f5',
        accent4: '#b325273a',
      },
      semantic: {
        success: '#36c4a8',
        error: '#ff5963',
        warning: '#e09030',
        info: '#6090d8',
      },
      surface: {
        glass: 'rgba(136,120,245,0.07)',
        glassStrong: 'rgba(136,120,245,0.12)',
        glassBorder: 'rgba(136,120,245,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(111,97,239,0.4)',
        primaryGlow: 'rgba(111,97,239,0.15)',
        primarySubtle: 'rgba(111,97,239,0.06)',
      },
    },
  },
};
