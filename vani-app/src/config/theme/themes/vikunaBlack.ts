import type { ThemeConfig } from '../types';

/**
 * Vikuna Black — the product's own theme, and the default.
 *
 * Dark mode is the reference design's palette exactly: amber on deep ink.
 *
 * NOTE ON THE GOLD. Three different values have been in play — `#C9A84C` in
 * VaNiGTM's copy of this file, `#c9973a` hardcoded in vani-app's globals.css,
 * and `#F5A623` here, which is what Charan handed over on 2026-09-22 as the
 * definition to use. This file is that one. If the console looks warmer than
 * it did, that is why, and it is one line to change back.
 */
export const VikunaBlackTheme: ThemeConfig = {
  id: 'vikuna-black',
  name: 'Vikuna Black',
  blurb: 'The house theme. Amber on deep ink.',
  colors: {
    // Light mode — a warm, professional light variant of the dark palette.
    brand: {
      primary: '#D4911E',      // Warm amber, darkened for light-bg readability
      secondary: '#1A1D26',    // Near-black for strong contrast
      tertiary: '#5A6178',     // Muted slate
      alternate: '#F4F3F0',    // Warm off-white surface
    },
    utility: {
      primaryText: '#1A1D26',
      secondaryText: '#5A6178',
      primaryBackground: '#FAFAF8',    // Warm white
      secondaryBackground: '#F0EFEB',  // Warm light gray
    },
    accent: {
      accent1: '#D4911E',
      accent2: '#1A1D26',
      accent3: '#B0B5C5',
      accent4: '#E8E7E3',
    },
    semantic: {
      success: '#2ECC71',
      error: '#E74C3C',
      warning: '#F5A623',
      info: '#3498DB',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#F5A623',      // --amber
        secondary: '#E8E6E0',    // --text
        tertiary: '#3A3F52',     // --faint: borders and dividers
        alternate: '#1C2030',    // --surface2: elevated surface
      },
      utility: {
        primaryText: '#E8E6E0',
        secondaryText: '#7A8099',        // --muted
        primaryBackground: '#0D0F14',    // --bg
        secondaryBackground: '#13161D',  // --surface
      },
      accent: {
        accent1: '#F5A623',
        accent2: '#E8E6E0',
        accent3: '#3A3F52',
        accent4: '#1C2030',
      },
      semantic: {
        success: '#2ECC71',
        error: '#E74C3C',
        warning: '#F5A623',
        info: '#3498DB',
      },
    },
  },
};
