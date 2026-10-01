// src/config/theme/themes/TrustworthyTheme.ts
// Trustworthy Professional Theme - Building Trust First, Dynamic Through Action
// Color Strategy: Deep blues for trust, Coral CTAs for conversion

import { Theme } from '../types';

const trustworthyTheme: Theme = {
  name: 'trustworthy-professional',
  colors: {
    primary: {
      main: '#003366', // Deep Navy - Authority & Trust (headers, navigation)
      light: '#a0c1d6', // Light Blue - Soft accents, borders, hover
      dark: '#001f3f', // Darker Navy - Deep backgrounds
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#FF6F61', // Coral - HIGH CONVERSION CTAs ONLY
      light: '#ff8a7a', // Light Coral - Hover states for CTAs
      dark: '#e55a4a', // Dark Coral - Active/pressed state
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F2F4F7', // Light Gray - Clean, professional background
      paper: '#FFFFFF', // Pure white for cards/sections
      dark: '#002244', // Dark mode background (deep navy)
    },
    text: {
      primary: '#4d4d4d', // Professional Dark Gray - Main text
      secondary: '#6b7280', // Medium Gray - Secondary text
      disabled: '#9ca3af',
      hint: '#d1d5db',
    },
    common: {
      black: '#000000',
      white: '#FFFFFF',
    },
    error: {
      main: '#dc2626',
      light: '#ef4444',
      dark: '#b91c1c',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
      contrastText: '#000000',
    },
    info: {
      main: '#36f2fa', // Cyan - Modern tech edge (links, active states)
      light: '#5ff5fc',
      dark: '#1ec9d1',
      contrastText: '#000000',
    },
    success: {
      main: '#006688', // Teal - Professional success (section backgrounds, positive actions)
      light: '#0088aa',
      dark: '#004466',
      contrastText: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: "'Inter', 'Roboto', 'Helvetica', 'Arial', sans-serif",
    fontSize: 16,
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: {
      fontSize: '3.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 600, // Slightly bolder for trust
      lineHeight: 1.75,
      textTransform: 'none',
    },
  },
  spacing: (factor: number) => `${factor * 8}px`,
  borderRadius: {
    small: '6px', // Slightly more rounded for modern feel
    medium: '10px',
    large: '14px',
    round: '50%',
  },
  shadows: {
    none: 'none',
    small: '0 1px 3px rgba(0, 51, 102, 0.08)',
    medium: '0 4px 6px -1px rgba(0, 51, 102, 0.1), 0 2px 4px -1px rgba(0, 51, 102, 0.06)',
    large: '0 10px 15px -3px rgba(0, 51, 102, 0.12), 0 4px 6px -2px rgba(0, 51, 102, 0.08)',
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

export default trustworthyTheme;
