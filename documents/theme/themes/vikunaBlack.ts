// src/config/theme/themes/vikunaBlack.ts
import { ThemeConfig } from '../types';

export const VikunaBlackTheme: ThemeConfig = {
  id: 'vikuna-black',
  name: 'Vikuna Black',
  colors: {
    // Light mode - a warm, professional light variant inspired by the dark palette
    brand: {
      primary: '#D4911E',      // Warm amber (darkened for light bg readability)
      secondary: '#1A1D26',    // Near-black for strong contrast
      tertiary: '#5A6178',     // Muted slate
      alternate: '#F4F3F0',    // Warm off-white surface
    },
    utility: {
      primaryText: '#1A1D26',          // Near-black text
      secondaryText: '#5A6178',        // Muted slate
      primaryBackground: '#FAFAF8',    // Warm white
      secondaryBackground: '#F0EFEB',  // Warm light gray
    },
    accent: {
      accent1: '#D4911E',     // Amber accent
      accent2: '#1A1D26',     // Dark accent
      accent3: '#B0B5C5',     // Light slate
      accent4: '#E8E7E3',     // Warm light border
    },
    semantic: {
      success: '#2ECC71',     // Green (matches HTML reference)
      error: '#E74C3C',       // Red (matches HTML reference)
      warning: '#F5A623',     // Amber warning
      info: '#3498DB',        // Blue info
    }
  },
  darkMode: {
    colors: {
      // Dark mode - exact colors from the HTML reference design
      brand: {
        primary: '#F5A623',      // --amber: golden amber accent
        secondary: '#E8E6E0',    // --text: light cream for contrast elements
        tertiary: '#3A3F52',     // --faint: subtle borders/dividers
        alternate: '#1C2030',    // --surface2: elevated surface
      },
      utility: {
        primaryText: '#E8E6E0',          // --text: cream white
        secondaryText: '#7A8099',        // --muted: muted slate blue
        primaryBackground: '#0D0F14',    // --bg: deep dark background
        secondaryBackground: '#13161D',  // --surface: card/panel background
      },
      accent: {
        accent1: '#F5A623',     // Amber glow
        accent2: '#E8E6E0',     // Light text accent
        accent3: '#3A3F52',     // Faint/border
        accent4: '#1C2030',     // Elevated surface
      },
      semantic: {
        success: '#2ECC71',     // --green: vibrant green
        error: '#E74C3C',       // --red: vibrant red
        warning: '#F5A623',     // Amber warning
        info: '#3498DB',        // Blue info
      }
    }
  }
};
