// src/config/theme/themes/TechAITheme.ts
import { Theme } from '../types';

const techAITheme: Theme = {
  name: 'tech-ai',
  colors: {
    primary: {
      main: '#06d5cd', // Bright cyan - modern AI/tech feel
      light: '#dfedec', // Light cyan background
      dark: '#18aa99', // Darker teal
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#984bb6', // Purple - sophistication
      light: '#E9D5FF',
      dark: '#7c3d94',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#f1f4f8', // Light gray-blue
      paper: '#FFFFFF',
      dark: '#132121', // Dark mode background
    },
    text: {
      primary: '#101518', // Almost black
      secondary: '#5763cc', // Purple-blue for secondary text
      disabled: '#95a1ac',
      hint: '#95a1ac',
    },
    common: {
      black: '#000000',
      white: '#FFFFFF',
    },
    error: {
      main: '#c4454d',
      light: '#E57373',
      dark: '#a33840',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#f3c344',
      light: '#FFB74D',
      dark: '#c99c36',
      contrastText: '#000000',
    },
    info: {
      main: '#06d5cd',
      light: '#64B5F6',
      dark: '#18aa99',
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#16857b',
      light: '#81C784',
      dark: '#116a62',
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
    small: '0 1px 3px rgba(6, 213, 205, 0.1)',
    medium: '0 4px 6px -1px rgba(6, 213, 205, 0.1), 0 2px 4px -1px rgba(6, 213, 205, 0.06)',
    large: '0 10px 15px -3px rgba(6, 213, 205, 0.15), 0 4px 6px -2px rgba(6, 213, 205, 0.08)',
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

export default techAITheme;
