// src/config/theme/themes/DarkEditorialTheme.ts
// Dark Editorial Theme - Premium, authoritative, high-conversion
// Design: Fraunces serif headings + DM Sans body, dark ink backgrounds
// Color Strategy: Deep ink for authority, burnt orange CTAs, teal trust, gold accents

import { Theme } from '../types';

const darkEditorialTheme: Theme = {
  name: 'dark-editorial',
  colors: {
    primary: {
      main: '#0A0F1E',      // Deep Ink - Primary backgrounds, hero sections
      light: '#1A2038',     // Lighter Ink - Cards, elevated surfaces
      dark: '#050810',      // Darkest Ink - Deepest backgrounds
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#E8420A',      // Burnt Orange - PRIMARY CTA, high-conversion buttons
      light: '#FF5A22',     // Lighter Orange - Hover state
      dark: '#C23508',      // Darker Orange - Active/pressed state
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#0A0F1E',   // Deep Ink - Page background
      paper: '#111827',     // Slightly lighter - Cards, sections
      dark: '#050810',      // Deepest - Footer, overlays
    },
    text: {
      primary: '#F5F5F5',   // Off-white - Primary text on dark
      secondary: '#A0AEC0', // Muted blue-gray - Secondary text, descriptions
      disabled: '#4A5568',  // Dark gray - Disabled states
      hint: '#718096',      // Medium gray - Hints, placeholders
    },
    common: {
      black: '#000000',
      white: '#FFFFFF',
    },
    error: {
      main: '#EF4444',
      light: '#F87171',
      dark: '#DC2626',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#C9973A',      // Gold - Premium accent, badges, highlights
      light: '#D4A94E',     // Light Gold - Hover
      dark: '#B8862E',      // Dark Gold - Active
      contrastText: '#000000',
    },
    info: {
      main: '#0B7B6B',      // Teal - Trust signals, success metrics, links
      light: '#0D9B87',     // Light Teal - Hover
      dark: '#065F53',      // Dark Teal - Active
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#0B7B6B',      // Teal (shared with info for consistency)
      light: '#0D9B87',
      dark: '#065F53',
      contrastText: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: "'DM Sans', 'Inter', 'Helvetica', 'Arial', sans-serif",
    headingFontFamily: "'Fraunces', 'Georgia', 'Times New Roman', serif",
    fontSize: 16,
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: {
      fontSize: '4rem',
      fontWeight: 700,
      lineHeight: 1.1,
      letterSpacing: '-0.03em',
      // Note: Components should apply fontFamily: "'Fraunces', serif" for headings
    },
    h2: {
      fontSize: '3rem',
      fontWeight: 700,
      lineHeight: 1.15,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontSize: '2.25rem',
      fontWeight: 600,
      lineHeight: 1.25,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h5: {
      fontSize: '1.375rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1.125rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1.125rem',   // Slightly larger body for editorial feel
      fontWeight: 400,
      lineHeight: 1.7,        // More generous line height for readability
    },
    body2: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    button: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.75,
      textTransform: 'none',   // No uppercase - editorial style
    },
  },
  spacing: (factor: number) => `${factor * 8}px`,
  borderRadius: {
    small: '4px',     // Tighter radius for editorial sharpness
    medium: '8px',
    large: '12px',
    round: '50%',
  },
  shadows: {
    none: 'none',
    small: '0 1px 3px rgba(0, 0, 0, 0.3)',
    medium: '0 4px 12px rgba(0, 0, 0, 0.4)',
    large: '0 12px 24px rgba(0, 0, 0, 0.5)',
  },
  transitions: {
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
      enteringScreen: 225,
      leavingScreen: 195,
    },
  },
};

export default darkEditorialTheme;
