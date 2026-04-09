import { ThemeConfig } from '../types';

// Jade Thorn — pixel-matched to contactnest-ux.html reference design.
// Warm parchment (#f6f4ef) bg + white cards + deep jade (#0f4c3a) + aged brass (#c7a557).
// This is the look the reference HTML delivers.

export const JadeThornTheme: ThemeConfig = {
  id: 'jade-thorn',
  name: 'Jade Thorn',
  colors: {
    brand: {
      primary: '#0f4c3a',    // deep jade — exact from HTML --accent
      secondary: '#c7a557',  // aged brass — exact from HTML --accent-2
      tertiary: '#5a7a6e',   // muted sage bridge
      alternate: '#ecebe4',  // --bg-deep from HTML (deeper parchment surface)
    },
    utility: {
      primaryText: '#1a1a1a',          // --ink from HTML
      secondaryText: '#8a8884',        // --ink-3 from HTML (muted labels)
      primaryBackground: '#f6f4ef',   // --bg from HTML — warm parchment
      secondaryBackground: '#ffffff', // --surface from HTML — white cards on parchment
    },
    accent: {
      accent1: '#0f4c3a',  // jade
      accent2: '#c7a557',  // brass
      accent3: '#7a4a2a',  // warm brown
      accent4: '#2d6a5a',  // mid-jade
    },
    semantic: {
      success: '#2d7a4f',  // --ok from HTML
      error: '#b54034',    // --danger from HTML
      warning: '#c47e1a',  // --warn from HTML
      info: '#2a5f8a',     // deep slate-blue
    },
    surface: {
      glass: 'rgba(15,76,58,0.04)',
      glassStrong: 'rgba(15,76,58,0.07)',
      glassBorder: '#e6e3d9',          // --line from HTML — exact border colour
      primaryDim: 'rgba(15,76,58,0.25)',
      primaryGlow: 'rgba(15,76,58,0.1)',
      primarySubtle: 'rgba(15,76,58,0.04)',  // --accent-soft equivalent
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#3aad7e',    // Bright jade — legible on near-black
        secondary: '#d4b46a',  // Softened brass
        tertiary: '#5a9a7a',
        alternate: '#1a2e22',
      },
      utility: {
        primaryText: '#f4f1e9',           // Warm cream
        secondaryText: 'rgba(244,241,233,0.68)',
        primaryBackground: '#0a0f0d',
        secondaryBackground: '#1a2e22',
      },
      accent: {
        accent1: '#3aad7e',
        accent2: '#d4b46a',
        accent3: '#c47848',
        accent4: '#42a882',
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
        glassBorder: 'rgba(58,173,126,0.24)',
        primaryDim: 'rgba(58,173,126,0.36)',
        primaryGlow: 'rgba(58,173,126,0.16)',
        primarySubtle: 'rgba(58,173,126,0.07)',
      },
    },
  },
};
