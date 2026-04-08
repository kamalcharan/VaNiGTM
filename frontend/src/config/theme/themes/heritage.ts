import { ThemeConfig } from '../types';

export const HeritageTheme: ThemeConfig = {
  id: 'heritage',
  name: 'Heritage',
  colors: {
    brand: {
      primary: '#0f4c3a',    // Deep forest jade — saturated, rich, high contrast
      secondary: '#c7a557',  // Brass gold — warm complement
      tertiary: '#5a7a6e',   // Muted sage — mid-tone bridge
      alternate: '#ede9e1',  // Warm parchment surface
    },
    utility: {
      primaryText: '#1a1a1a',          // Near-black — readable without harshness
      secondaryText: 'rgba(26,26,26,0.55)',
      primaryBackground: '#f6f4ef',   // Warm parchment — the key that makes jade pop
      secondaryBackground: '#ede9e1', // Slightly deeper parchment
    },
    accent: {
      accent1: '#0f4c3a',  // Jade (same as primary for cohesion)
      accent2: '#c7a557',  // Brass gold
      accent3: '#7a4a2a',  // Warm brown — tertiary accent
      accent4: '#2d6a5a',  // Mid-jade
    },
    semantic: {
      success: '#1a6b4a',  // Deep green — success with jade family
      error: '#b83232',    // Deep red — warm tone matches parchment
      warning: '#c7831a',  // Amber — warm, on-brand
      info: '#2a5f8a',     // Deep slate-blue — cool contrast
    },
    surface: {
      glass: 'rgba(15,76,58,0.04)',
      glassStrong: 'rgba(15,76,58,0.07)',
      glassBorder: 'rgba(15,76,58,0.12)',
      primaryDim: 'rgba(15,76,58,0.3)',
      primaryGlow: 'rgba(15,76,58,0.12)',
      primarySubtle: 'rgba(15,76,58,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#3aad7e',    // Bright jade — legible on near-black
        secondary: '#d4b46a',  // Softened brass
        tertiary: '#5a9a7a',   // Lighter sage — readable on dark
        alternate: '#1a2e22',  // Lifted parchment-forest surface — clearly above bg
      },
      utility: {
        primaryText: '#f4f1e9',           // Warm cream — not pure white
        secondaryText: 'rgba(244,241,233,0.68)',
        primaryBackground: '#0a0f0d',    // Near-black with green undertone
        secondaryBackground: '#1a2e22',  // Clearly lifted surface — cards visible against bg
      },
      accent: {
        accent1: '#3aad7e',  // Bright jade
        accent2: '#d4b46a',  // Brass gold — good on dark
        accent3: '#c47848',  // Warm amber-brown — lifted for legibility
        accent4: '#42a882',  // Bright mid-jade — lifted for legibility
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#e0a040',
        info: '#4a8fc4',
      },
      surface: {
        glass: 'rgba(58,173,126,0.07)',
        glassStrong: 'rgba(58,173,126,0.13)',
        glassBorder: 'rgba(58,173,126,0.24)',  // Lifted — borders now visible
        primaryDim: 'rgba(58,173,126,0.36)',
        primaryGlow: 'rgba(58,173,126,0.16)',
        primarySubtle: 'rgba(58,173,126,0.07)',
      },
    },
  },
};
