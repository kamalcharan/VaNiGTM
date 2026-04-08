import { ThemeConfig } from '../types';

export const ClassicElegantTheme: ThemeConfig = {
  id: 'classic-elegant',
  name: 'Classic & Elegant',
  colors: {
    brand: {
      primary: '#4b998c',
      secondary: '#928163',
      tertiary: '#c6604a',
      alternate: '#c587c4',
    },
    utility: {
      primaryText: '#0b191e',
      secondaryText: 'rgba(11,25,30,0.58)',
      primaryBackground: '#f2f5f2',        // Subtle teal-green tint (was generic #f1f4f8)
      secondaryBackground: '#e8eeec',
    },
    accent: {
      accent1: '#444b598c',
      accent2: '#44928163',
      accent3: '#4c6d604a',
      accent4: '#cfffffff',
    },
    semantic: {
      success: '#336a4a',
      error: '#c4454d',
      warning: '#f3c344',
      info: '#2a6b8a',                      // Was #ffffff — invisible on light bg
    },
    surface: {
      glass: 'rgba(75,153,140,0.05)',       // Teal-tinted (was generic black)
      glassStrong: 'rgba(75,153,140,0.09)',
      glassBorder: 'rgba(75,153,140,0.16)',
      primaryDim: 'rgba(75,153,140,0.35)',
      primaryGlow: 'rgba(75,153,140,0.1)',
      primarySubtle: 'rgba(75,153,140,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#5ab8aa',                 // Slightly brighter teal for dark bg legibility
        secondary: '#928163',
        tertiary: '#c6604a',
        alternate: '#07282e',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#0b191e',
        secondaryBackground: '#1e3040',     // Clearly lifted (was #131f24 — too close)
      },
      accent: {
        accent1: '#44db986c',
        accent2: '#4d928163',
        accent3: '#dc6d004a',
        accent4: '#b20cb7be',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#f3c344',
        info: '#4a90c4',                    // Was #ffffff — invisible
      },
      surface: {
        glass: 'rgba(90,184,170,0.07)',
        glassStrong: 'rgba(90,184,170,0.12)',
        glassBorder: 'rgba(90,184,170,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(75,153,140,0.4)',
        primaryGlow: 'rgba(75,153,140,0.15)',
        primarySubtle: 'rgba(75,153,140,0.06)',
      },
    },
  },
};
