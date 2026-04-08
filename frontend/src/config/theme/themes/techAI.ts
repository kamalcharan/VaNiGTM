// src/config/theme/themes/techAI.ts
import { ThemeConfig } from '../types';

export const TechAITheme: ThemeConfig = {
  id: 'tech-ai',
  name: 'Tech AI',
  colors: {
    brand: {
      primary: '#06d5cd',
      secondary: '#18aa99',
      tertiary: '#984bb6',
      alternate: '#dfedec',
    },
    utility: {
      primaryText: '#101518',
      secondaryText: 'rgba(16,21,24,0.58)',   // Was #5763cc (blue-purple) — wrong for muted text
      primaryBackground: '#f0f7f6',            // Cyan-tinted (was generic #f1f4f8)
      secondaryBackground: '#e4f2f0',
    },
    accent: {
      accent1: '#4c06d5cd',
      accent2: '#4d18aa99',
      accent3: '#4d984bb6',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#16a878',
      error: '#c4454d',
      warning: '#e09030',
      info: '#06d5cd',
    },
    surface: {
      glass: 'rgba(6,213,205,0.05)',           // Cyan-tinted (was generic black)
      glassStrong: 'rgba(6,213,205,0.09)',
      glassBorder: 'rgba(6,213,205,0.16)',
      primaryDim: 'rgba(6,213,205,0.35)',
      primaryGlow: 'rgba(6,213,205,0.1)',
      primarySubtle: 'rgba(6,213,205,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#10e8de',                    // Brighter cyan for dark bg
        secondary: '#22c0aa',
        tertiary: '#b060d0',
        alternate: '#293d42',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: 'rgba(255,255,255,0.65)',
        primaryBackground: '#132121',
        secondaryBackground: '#1c3230',        // FIXED: was #101818 — inverted (darker than bg)!
      },
      accent: {
        accent1: '#4c10e8de',
        accent2: '#4d22c0aa',
        accent3: '#4db060d0',
        accent4: '#b31c3230',
      },
      semantic: {
        success: '#28d8a0',
        error: '#e05555',
        warning: '#e09030',
        info: '#10e8de',
      },
      surface: {
        glass: 'rgba(16,232,222,0.07)',
        glassStrong: 'rgba(16,232,222,0.12)',
        glassBorder: 'rgba(16,232,222,0.24)', // Was 8% — now visible
        primaryDim: 'rgba(6,213,205,0.4)',
        primaryGlow: 'rgba(6,213,205,0.15)',
        primarySubtle: 'rgba(6,213,205,0.06)',
      },
    },
  },
};
