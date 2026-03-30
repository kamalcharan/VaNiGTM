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
      secondaryText: '#5763cc',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#4c06d5cd',
      accent2: '#4d18aa99',
      accent3: '#4d984bb6',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#16857b',
      error: '#c4454d',
      warning: '#f3c344',
      info: '#06d5cd',
    }
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#06d5cd',
        secondary: '#18aa99',
        tertiary: '#9984bb6',
        alternate: '#293d42',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#132121',
        secondaryBackground: '#101818',
      },
      accent: {
        accent1: '#4c06d5cd',
        accent2: '#4d18aa99',
        accent3: '#4d984bb6',
        accent4: '#b31d2428',
      },
      semantic: {
        success: '#16857b',
        error: '#c4454d',
        warning: '#f3c344',
        info: '#06d5cd',
      }
    }
  }
};