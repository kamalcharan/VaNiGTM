// src/config/theme/themes/ModernBusinessTheme.ts
import { Theme } from '../types';

const modernBusinessTheme: Theme = {
  name: 'modern-business',
  colors: {
    primary: {
      main: '#39d2c0', // Modern teal - professional & fresh
      light: '#dfe3e7', // Light gray for backgrounds
      dark: '#1aaa99', // Darker teal
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#ee8b60', // Coral/orange - warm accent
      light: '#ffeee6',
      dark: '#d97550',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#f1f4f8', // Light cool gray
      paper: '#FFFFFF',
      dark: '#1a1f24', // Dark mode background
    },
    text: {
      primary: '#1a1f24', // Almost black
      secondary: '#656a85', // Medium gray-blue
      disabled: '#95a1ac',
      hint: '#95a1ac',
    },
    common: {
      black: '#000000',
      white: '#FFFFFF',
    },
    error: {
      main: '#c44454',
      light: '#E57373',
      dark: '#a33840',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#cc8e30',
      light: '#FFB74D',
      dark: '#a67226',
      contrastText: '#000000',
    },
    info: {
      main: '#39d2c0',
      light: '#64B5F6',
      dark: '#1aaa99',
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#165070',
      light: '#81C784',
      dark: '#0f3a50',
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
    },
    h2: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.3,
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
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.75,
      textTransform: 'none',
    },
  },
  spacing: (factor: number) => `${factor * 8}px`,
  borderRadius: {
    small: '4px',
    medium: '8px',
    large: '12px',
    round: '50%',
  },
  shadows: {
    none: 'none',
    small: '0 1px 3px rgba(57, 210, 192, 0.1)',
    medium: '0 4px 6px -1px rgba(57, 210, 192, 0.1), 0 2px 4px -1px rgba(57, 210, 192, 0.06)',
    large: '0 10px 15px -3px rgba(57, 210, 192, 0.15), 0 4px 6px -2px rgba(57, 210, 192, 0.08)',
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

export default modernBusinessTheme;
