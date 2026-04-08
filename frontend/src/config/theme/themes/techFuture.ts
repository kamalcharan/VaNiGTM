// src/config/theme/themes/techFuture.ts
import { ThemeConfig } from '../types';

export const TechFutureTheme: ThemeConfig = {
  id: 'tech-future',
  name: 'Tech Future',
  colors: {
    brand: {
      primary: '#4060e0',                    // Electric indigo — distinct from Sleek Cool's sky #2797ff
      secondary: '#5030b0',                  // Deep electric purple
      tertiary: '#acc420',
      alternate: '#e8e4f8',
    },
    utility: {
      primaryText: '#161624',
      secondaryText: 'rgba(22,22,36,0.58)',
      primaryBackground: '#f0f2fa',           // Deep blue-purple tint (distinct from Sleek Cool's icy blue)
      secondaryBackground: '#e4e8f8',
    },
    accent: {
      accent1: '#4c4060e0',
      accent2: '#4c5030b0',
      accent3: '#4cacc420',
      accent4: '#b2e8e4f8',
    },
    semantic: {
      success: '#27a852',
      error: '#e74444',
      warning: '#c96446',
      info: '#4060e0',
    },
    surface: {
      glass: 'rgba(64,96,224,0.05)',          // Indigo-tinted (was generic black)
      glassStrong: 'rgba(64,96,224,0.09)',
      glassBorder: 'rgba(64,96,224,0.16)',
      primaryDim: 'rgba(64,96,224,0.35)',
      primaryGlow: 'rgba(64,96,224,0.1)',
      primarySubtle: 'rgba(64,96,224,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#6080f0',                   // Bright electric indigo for dark bg
        secondary: '#8050d0',
        tertiary: '#c8e040',
        alternate: '#212836',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#161624',         // Midnight navy (deeper purple-black than Sleek Cool)
        secondaryBackground: '#26264a',       // Clearly lifted + indigo-tinted (was #1d1d2d)
      },
      accent: {
        accent1: '#4c6080f0',
        accent2: '#4c8050d0',
        accent3: '#4cc8e040',
        accent4: '#b326264a',
      },
      semantic: {
        success: '#36c468',
        error: '#e74444',
        warning: '#d07040',
        info: '#6080f0',
      },
      surface: {
        glass: 'rgba(96,128,240,0.07)',
        glassStrong: 'rgba(96,128,240,0.12)',
        glassBorder: 'rgba(96,128,240,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(64,96,224,0.4)',
        primaryGlow: 'rgba(64,96,224,0.15)',
        primarySubtle: 'rgba(64,96,224,0.06)',
      },
    },
  },
};
