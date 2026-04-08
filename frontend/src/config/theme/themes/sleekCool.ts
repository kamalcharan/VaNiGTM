// src/config/theme/themes/sleekCool.ts
import { ThemeConfig } from '../types';

export const SleekCoolTheme: ThemeConfig = {
  id: 'sleek-cool',
  name: 'Sleek & Cool',
  colors: {
    brand: {
      primary: '#2797ff',
      secondary: '#8ac7ff',                  // Sky blue — lighter, airier than Tech Future
      tertiary: '#acc420',
      alternate: '#e0e3e7',
    },
    utility: {
      primaryText: '#121518',
      secondaryText: 'rgba(18,21,24,0.58)',
      primaryBackground: '#f0f5fb',           // Icy blue-white (was generic #f1f4f8)
      secondaryBackground: '#e4eef8',
    },
    accent: {
      accent1: '#4c2797ff',
      accent2: '#4c8ac7ff',
      accent3: '#4cacc420',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#27ae52',
      error: '#e44444',
      warning: '#c96446',
      info: '#2797ff',
    },
    surface: {
      glass: 'rgba(39,151,255,0.05)',         // Blue-tinted (was generic black)
      glassStrong: 'rgba(39,151,255,0.09)',
      glassBorder: 'rgba(39,151,255,0.16)',
      primaryDim: 'rgba(39,151,255,0.35)',
      primaryGlow: 'rgba(39,151,255,0.1)',
      primarySubtle: 'rgba(39,151,255,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#50aaff',                   // Brighter sky blue for dark bg
        secondary: '#90d0ff',
        tertiary: '#c8e040',
        alternate: '#212836',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#121518',
        secondaryBackground: '#22273a',       // Clearly lifted + blue-tinted (was #1a1d24)
      },
      accent: {
        accent1: '#4c50aaff',
        accent2: '#4c90d0ff',
        accent3: '#4cc8e040',
        accent4: '#b322273a',
      },
      semantic: {
        success: '#36c468',
        error: '#e44444',
        warning: '#d07040',
        info: '#50aaff',
      },
      surface: {
        glass: 'rgba(80,170,255,0.07)',
        glassStrong: 'rgba(80,170,255,0.12)',
        glassBorder: 'rgba(80,170,255,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(39,151,255,0.4)',
        primaryGlow: 'rgba(39,151,255,0.15)',
        primarySubtle: 'rgba(39,151,255,0.06)',
      },
    },
  },
};
