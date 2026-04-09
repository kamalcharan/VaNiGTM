// src/config/theme/themes/techFuture.ts
import { ThemeConfig } from '../types';

export const TechFutureTheme: ThemeConfig = {
  id: 'tech-future',
  name: 'Tech Future',
  colors: {
    brand: {
      primary: '#4060e0',
      secondary: '#5030b0',
      tertiary: '#acc420',
      alternate: '#dce2f8',
    },
    utility: {
      primaryText: '#121220',
      secondaryText: '#505080',
      primaryBackground: '#f3f3fc',  // subtle indigo tint
      secondaryBackground: '#ffffff', // white cards
    },
    accent: {
      accent1: 'rgba(64,96,224,0.15)',
      accent2: 'rgba(80,48,176,0.15)',
      accent3: 'rgba(172,196,32,0.15)',
      accent4: 'rgba(64,96,224,0.08)',
    },
    semantic: {
      success: '#2d7a4f',
      error: '#b54034',
      warning: '#c47e1a',
      info: '#4060e0',
    },
    surface: {
      glass: 'rgba(64,96,224,0.05)',
      glassStrong: 'rgba(64,96,224,0.09)',
      glassBorder: '#d0d8f4',
      primaryDim: 'rgba(64,96,224,0.25)',
      primaryGlow: 'rgba(64,96,224,0.12)',
      primarySubtle: 'rgba(64,96,224,0.05)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#6080f0',
        secondary: '#8050d0',
        tertiary: '#c8e040',
        alternate: '#1e1e40',
      },
      utility: {
        primaryText: '#eeeeff',
        secondaryText: 'rgba(238,238,255,0.65)',
        primaryBackground: '#0e0e20',
        secondaryBackground: '#1e1e40',
      },
      accent: {
        accent1: 'rgba(96,128,240,0.20)',
        accent2: 'rgba(128,80,208,0.18)',
        accent3: 'rgba(200,224,64,0.18)',
        accent4: 'rgba(96,128,240,0.10)',
      },
      semantic: {
        success: '#4ecb8a',
        error: '#e05555',
        warning: '#e0a040',
        info: '#6080f0',
      },
      surface: {
        glass: 'rgba(96,128,240,0.07)',
        glassStrong: 'rgba(96,128,240,0.12)',
        glassBorder: 'rgba(96,128,240,0.24)',
        primaryDim: 'rgba(96,128,240,0.30)', // Adjusted for Dark Mode depth
        primaryGlow: 'rgba(96,128,240,0.18)', // Increased for "Tech" feel
        primarySubtle: 'rgba(96,128,240,0.08)',
      },
    },
  },
};