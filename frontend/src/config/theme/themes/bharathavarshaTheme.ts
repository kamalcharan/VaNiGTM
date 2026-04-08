import { ThemeConfig } from '../types';

export const BharathaVarshaTheme: ThemeConfig = {
  id: 'bharathavarsha',
  name: 'Bharathavarsha',
  colors: {
    brand: {
      primary: '#e67e22',
      secondary: '#d35400',
      tertiary: '#8e44ad',
      alternate: '#f39c12',
    },
    utility: {
      primaryText: '#2c3e50',
      secondaryText: 'rgba(44,62,80,0.6)',
      primaryBackground: '#f9f5f0',        // Already warm — kept
      secondaryBackground: '#f0e8dc',
    },
    accent: {
      accent1: '#4ce67e22',
      accent2: '#4cd35400',
      accent3: '#4c8e44ad',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#27ae60',
      error: '#e74c3c',
      warning: '#f1c40f',
      info: '#3498db',
    },
    surface: {
      glass: 'rgba(230,126,34,0.05)',       // Orange-tinted (was generic black)
      glassStrong: 'rgba(230,126,34,0.09)',
      glassBorder: 'rgba(230,126,34,0.16)',
      primaryDim: 'rgba(230,126,34,0.35)',
      primaryGlow: 'rgba(230,126,34,0.1)',
      primarySubtle: 'rgba(230,126,34,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#f09030',                 // Warmer, brighter orange for dark bg
        secondary: '#e06020',
        tertiary: '#a855c8',
        alternate: '#1c1208',               // Was #f39c12 — bright yellow was wrong for dark surface
      },
      utility: {
        primaryText: '#ecf0f1',
        secondaryText: 'rgba(236,240,241,0.65)',
        primaryBackground: '#2c3e50',
        secondaryBackground: '#3a5068',     // Clearly lifted (was #34495e — close delta)
      },
      accent: {
        accent1: '#4cf09030',
        accent2: '#4ce06020',
        accent3: '#4ca855c8',
        accent4: '#b21c1208',
      },
      semantic: {
        success: '#2ecc71',
        error: '#e74c3c',
        warning: '#f1c40f',
        info: '#3498db',
      },
      surface: {
        glass: 'rgba(240,144,48,0.07)',
        glassStrong: 'rgba(240,144,48,0.12)',
        glassBorder: 'rgba(240,144,48,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(230,126,34,0.4)',
        primaryGlow: 'rgba(230,126,34,0.15)',
        primarySubtle: 'rgba(230,126,34,0.06)',
      },
    },
  },
};
