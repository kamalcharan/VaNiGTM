// src/config/theme/themes/sleekCool.ts
import { ThemeConfig } from '../types';

export const SleekCoolTheme: ThemeConfig = {
  id: 'sleek-cool',
  name: 'Sleek & Cool',
  colors: {
    brand: {
      primary: '#2797ff',
      secondary: '#8ac7ff',
      tertiary: '#acc420',
      alternate: '#e0e3e7',
    },
    utility: {
      primaryText: '#121518',
      secondaryText: '#636f81',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
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
      glass: 'rgba(0,0,0,0.03)',
      glassStrong: 'rgba(0,0,0,0.05)',
      glassBorder: 'rgba(0,0,0,0.08)',
      primaryDim: 'rgba(39,151,255,0.35)',
      primaryGlow: 'rgba(39,151,255,0.1)',
      primarySubtle: 'rgba(39,151,255,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#2797ff',
        secondary: '#8ac7ff',
        tertiary: '#acc420',
        alternate: '#212836',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#919eab',
        primaryBackground: '#121518',
        secondaryBackground: '#1a1d24',
      },
      accent: {
        accent1: '#4c2797ff',
        accent2: '#4c8ac7ff',
        accent3: '#4cacc420',
        accent4: '#b3212836',
      },
      semantic: {
        success: '#27ae52',
        error: '#e44444',
        warning: '#c96446',
        info: '#2797ff',
      },
      surface: {
        glass: 'rgba(255,255,255,0.04)',
        glassStrong: 'rgba(255,255,255,0.07)',
        glassBorder: 'rgba(255,255,255,0.08)',
        primaryDim: 'rgba(39,151,255,0.4)',
        primaryGlow: 'rgba(39,151,255,0.15)',
        primarySubtle: 'rgba(39,151,255,0.06)',
      },
    },
  },
};