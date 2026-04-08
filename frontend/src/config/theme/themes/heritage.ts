import { ThemeConfig } from '../types';

// Heritage — Colonial Burgundy. Warm ivory bg + deep burgundy-wine primary + antique gold.
// Distinct from Jade Thorn (jade/green) — same premium warmth, different colour family.

export const HeritageTheme: ThemeConfig = {
  id: 'heritage',
  name: 'Heritage',
  colors: {
    brand: {
      primary: '#6a1f2a',    // Deep burgundy-wine
      secondary: '#b8914a',  // Antique gold
      tertiary: '#5a4030',   // Dark teak
      alternate: '#ede4d4',  // Warm sand surface
    },
    utility: {
      primaryText: '#1a1214',          // Warm near-black
      secondaryText: '#7a6860',        // Warm muted brown-grey
      primaryBackground: '#faf6f0',   // Warmer ivory (distinct from Jade Thorn's parchment)
      secondaryBackground: '#ffffff', // White cards
    },
    accent: {
      accent1: '#6a1f2a',  // Burgundy
      accent2: '#b8914a',  // Antique gold
      accent3: '#8a5030',  // Warm sienna
      accent4: '#3a5a70',  // Deep slate contrast
    },
    semantic: {
      success: '#2d6a3a',  // Deep forest green
      error: '#8b2020',    // Deep crimson
      warning: '#b8781a',  // Amber
      info: '#2a5070',     // Deep slate
    },
    surface: {
      glass: 'rgba(106,31,42,0.04)',
      glassStrong: 'rgba(106,31,42,0.07)',
      glassBorder: '#e8dfd4',           // Warm sand border
      primaryDim: 'rgba(106,31,42,0.22)',
      primaryGlow: 'rgba(106,31,42,0.09)',
      primarySubtle: 'rgba(106,31,42,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#c05060',    // Bright burgundy-rose for dark bg
        secondary: '#d4a85a',  // Warm gold
        tertiary: '#8a6848',   // Teak mid-tone
        alternate: '#1e1018',  // Deep plum-black surface
      },
      utility: {
        primaryText: '#f8f0e8',           // Warm ivory text
        secondaryText: 'rgba(248,240,232,0.68)',
        primaryBackground: '#0f0810',    // Deep plum-black — distinct dark
        secondaryBackground: '#221420',  // Lifted burgundy-dark surface
      },
      accent: {
        accent1: '#c05060',
        accent2: '#d4a85a',
        accent3: '#c07850',
        accent4: '#5080a0',
      },
      semantic: {
        success: '#4a9a60',
        error: '#e05050',
        warning: '#e09840',
        info: '#5090b8',
      },
      surface: {
        glass: 'rgba(192,80,96,0.07)',
        glassStrong: 'rgba(192,80,96,0.13)',
        glassBorder: 'rgba(192,80,96,0.24)',
        primaryDim: 'rgba(192,80,96,0.34)',
        primaryGlow: 'rgba(192,80,96,0.15)',
        primarySubtle: 'rgba(192,80,96,0.07)',
      },
    },
  },
};
