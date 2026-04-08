import { ThemeConfig } from '../types';

export const JadeThornTheme: ThemeConfig = {
  id: 'jade-thorn',
  name: 'Jade Thorn',
  colors: {
    brand: {
      primary: '#1a6948',    // Deep vibrant jade
      secondary: '#0c1a0f',  // Near-black thorn — the sharp contrast anchor
      tertiary: '#5a8a6e',   // Mid sage — softer bridge
      alternate: '#e5ece5',  // Jade-tinted surface
    },
    utility: {
      primaryText: '#0c1a0f',              // Deep forest black — near-black with green undertone
      secondaryText: 'rgba(12,26,15,0.55)',
      primaryBackground: '#f1f5f1',       // Cool marble white — jade-tinted, not parchment
      secondaryBackground: '#e5ece5',     // Slightly deeper jade-white surface
    },
    accent: {
      accent1: '#1a6948',  // Jade primary
      accent2: '#a0421a',  // Burnt umber thorn — warm-dark complement
      accent3: '#2a5a7a',  // Deep slate-blue contrast
      accent4: '#6a3a8a',  // Deep violet fourth
    },
    semantic: {
      success: '#1a6948',  // Jade itself as success
      error: '#b82020',    // Deep crimson thorn
      warning: '#b86820',  // Dark amber thorn
      info: '#1a4a6e',     // Deep slate-blue
    },
    surface: {
      glass: 'rgba(26,105,72,0.04)',
      glassStrong: 'rgba(26,105,72,0.08)',
      glassBorder: 'rgba(26,105,72,0.14)',
      primaryDim: 'rgba(26,105,72,0.28)',
      primaryGlow: 'rgba(26,105,72,0.12)',
      primarySubtle: 'rgba(26,105,72,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#35c27a',    // Vivid jade — pops on near-black
        secondary: '#e4f0e6',  // Pale jade-white
        tertiary: '#5aaa82',   // Lighter mid jade — readable on dark
        alternate: '#182c1e',  // Lifted forest surface — clearly above bg
      },
      utility: {
        primaryText: '#e4f0e6',              // Pale jade-white — not pure white
        secondaryText: 'rgba(228,240,230,0.68)',
        primaryBackground: '#07100a',       // Very deep forest black with green undertone
        secondaryBackground: '#182c1e',     // Clearly lifted surface — cards visible against bg
      },
      accent: {
        accent1: '#35c27a',  // Vivid jade
        accent2: '#e07040',  // Warm ember — thorn in dark
        accent3: '#5aaad4',  // Lifted slate-blue — readable on dark
        accent4: '#aa70e0',  // Lighter violet — readable on dark
      },
      semantic: {
        success: '#35c27a',  // Vivid jade
        error: '#e04444',    // Bright crimson
        warning: '#e09040',  // Bright amber
        info: '#5aaad4',     // Lifted slate-blue
      },
      surface: {
        glass: 'rgba(53,194,122,0.07)',
        glassStrong: 'rgba(53,194,122,0.13)',
        glassBorder: 'rgba(53,194,122,0.24)',  // Lifted — borders now visible
        primaryDim: 'rgba(53,194,122,0.34)',
        primaryGlow: 'rgba(53,194,122,0.16)',
        primarySubtle: 'rgba(53,194,122,0.07)',
      },
    },
  },
};
