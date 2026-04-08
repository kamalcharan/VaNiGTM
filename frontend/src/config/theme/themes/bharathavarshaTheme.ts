import { ThemeConfig } from '../types';

export const BharathaVarshaTheme: ThemeConfig = {
  id: 'bharathavarsha',
  name: 'Bharathavarsha',
  colors: {
    brand: {
      primary: '#e67e22',
      secondary: '#d35400',
      tertiary: '#8e44ad',
      alternate: '#fdebd0',
    },
    utility: {
      primaryText: '#1e1610',
      secondaryText: '#7a6a58',
      primaryBackground: '#fdf6ed',  // warm cream — Indian warmth
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(230,126,34,0.15)',
      accent2: 'rgba(211,84,0,0.15)',
      accent3: 'rgba(142,68,173,0.15)',
      accent4: 'rgba(230,126,34,0.08)',
    },
    semantic: {
      success: '#27ae60',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#2a6b9a',
    },
    surface: {
      glass: 'rgba(230,126,34,0.05)',
      glassStrong: 'rgba(230,126,34,0.09)',
      glassBorder: '#f0dfc8',
      primaryDim: 'rgba(230,126,34,0.25)',
      primaryGlow: 'rgba(230,126,34,0.12)',
      primarySubtle: 'rgba(230,126,34,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#f09030',
        secondary: '#e06020',
        tertiary: '#a855c8',
        alternate: '#1c1208',
      },
      utility: {
        primaryText: '#fdf0e0',
        secondaryText: 'rgba(253,240,224,0.65)',
        primaryBackground: '#1a1008',
        secondaryBackground: '#2e1e0e',
      },
      accent: {
        accent1: 'rgba(240,144,48,0.20)',
        accent2: 'rgba(224,96,32,0.18)',
        accent3: 'rgba(168,85,200,0.18)',
        accent4: 'rgba(240,144,48,0.10)',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#e0a040',
        info: '#4a90c4',
      },
      surface: {
        glass: 'rgba(240,144,48,0.07)',
        glassStrong: 'rgba(240,144,48,0.12)',
        glassBorder: 'rgba(240,144,48,0.24)',
        primaryDim: 'rgba(230,126,34,0.38)',
        primaryGlow: 'rgba(230,126,34,0.16)',
        primarySubtle: 'rgba(230,126,34,0.07)',
      },
    },
  },
};
