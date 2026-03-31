import { ThemeConfig } from '../types';

export const BharathaVarshaTheme: ThemeConfig = {
  id: 'bharathavarsha',
  name: 'Bharathavarsha',
  colors: {
    brand: {
      primary: '#e67e22',      // Primary orange from UI design
      secondary: '#d35400',    // Darker orange for contrast
      tertiary: '#8e44ad',     // Purple as complementary color
      alternate: '#f39c12',    // Yellow-orange for variety
    },
    utility: {
      primaryText: '#2c3e50',  // Dark slate for main text
      secondaryText: '#7f8c8d', // Medium gray for secondary text
      primaryBackground: '#f9f5f0', // Light cream background
      secondaryBackground: '#ffffff', // White background
    },
    accent: {
      accent1: '#4ce67e22',    // Transparent versions of the primary colors
      accent2: '#4cd35400',    
      accent3: '#4c8e44ad',    
      accent4: '#b2ffffff',    
    },
    semantic: {
      success: '#27ae60',      // Green for success
      error: '#e74c3c',        // Red for error
      warning: '#f1c40f',      // Yellow for warning
      info: '#3498db',         // Blue for information
    },
    surface: {
      glass: 'rgba(0,0,0,0.03)',
      glassStrong: 'rgba(0,0,0,0.05)',
      glassBorder: 'rgba(0,0,0,0.08)',
      primaryDim: 'rgba(230,126,34,0.35)',
      primaryGlow: 'rgba(230,126,34,0.1)',
      primarySubtle: 'rgba(230,126,34,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#e67e22',    // Keep primary orange consistent
        secondary: '#d35400',  // Darker orange
        tertiary: '#8e44ad',   // Purple
        alternate: '#f39c12',  // Yellow-orange
      },
      utility: {
        primaryText: '#ecf0f1', // Light gray almost white for text
        secondaryText: '#bdc3c7', // Medium light gray for secondary text
        primaryBackground: '#2c3e50', // Dark slate background
        secondaryBackground: '#34495e', // Slightly lighter slate
      },
      accent: {
        accent1: '#4ce67e22',
        accent2: '#4cd35400',
        accent3: '#4c8e44ad',
        accent4: '#b2f39c12',
      },
      semantic: {
        success: '#2ecc71',
        error: '#e74c3c',
        warning: '#f1c40f',
        info: '#3498db',
      },
      surface: {
        glass: 'rgba(255,255,255,0.04)',
        glassStrong: 'rgba(255,255,255,0.07)',
        glassBorder: 'rgba(255,255,255,0.08)',
        primaryDim: 'rgba(230,126,34,0.4)',
        primaryGlow: 'rgba(230,126,34,0.15)',
        primarySubtle: 'rgba(230,126,34,0.06)',
      },
    },
  },
};