import { ThemeConfig } from '../types';

// Jade Thorn — dark forest identity. Always dark, never parchment.
// Heritage owns warm-light. Jade Thorn owns deep-dark.
// The "thorn": sharp bright jade cutting through near-black forest.

export const JadeThornTheme: ThemeConfig = {
  id: 'jade-thorn',
  name: 'Jade Thorn',
  colors: {
    brand: {
      primary: '#35c27a',    // Vivid jade — pops on near-black
      secondary: '#e4f0e6',  // Pale jade-white
      tertiary: '#5aaa82',   // Mid jade
      alternate: '#182c1e',  // Lifted forest surface
    },
    utility: {
      primaryText: '#e4f0e6',              // Pale jade-white text
      secondaryText: 'rgba(228,240,230,0.68)',
      primaryBackground: '#07100a',        // Very deep forest black — the dark identity
      secondaryBackground: '#182c1e',      // Clearly lifted surface
    },
    accent: {
      accent1: '#35c27a',  // Vivid jade
      accent2: '#e07040',  // Warm ember — the thorn's heat
      accent3: '#5aaad4',  // Slate-blue contrast
      accent4: '#aa70e0',  // Violet fourth
    },
    semantic: {
      success: '#35c27a',
      error: '#e04444',
      warning: '#e09040',
      info: '#5aaad4',
    },
    surface: {
      glass: 'rgba(53,194,122,0.07)',
      glassStrong: 'rgba(53,194,122,0.13)',
      glassBorder: 'rgba(53,194,122,0.24)',
      primaryDim: 'rgba(53,194,122,0.34)',
      primaryGlow: 'rgba(53,194,122,0.16)',
      primarySubtle: 'rgba(53,194,122,0.07)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#42d88a',    // Even brighter jade for deeper dark
        secondary: '#f0f8f2',
        tertiary: '#6abf90',
        alternate: '#0f1c12',
      },
      utility: {
        primaryText: '#f0f8f2',
        secondaryText: 'rgba(240,248,242,0.68)',
        primaryBackground: '#030806',        // Deeper still for OS dark mode
        secondaryBackground: '#0f1c12',
      },
      accent: {
        accent1: '#42d88a',
        accent2: '#f08050',
        accent3: '#6abcee',
        accent4: '#c090f0',
      },
      semantic: {
        success: '#42d88a',
        error: '#f05050',
        warning: '#f0a050',
        info: '#6abcee',
      },
      surface: {
        glass: 'rgba(66,216,138,0.08)',
        glassStrong: 'rgba(66,216,138,0.14)',
        glassBorder: 'rgba(66,216,138,0.26)',
        primaryDim: 'rgba(66,216,138,0.36)',
        primaryGlow: 'rgba(66,216,138,0.18)',
        primarySubtle: 'rgba(66,216,138,0.08)',
      },
    },
  },
};
