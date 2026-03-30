// src/config/theme/themes/professionalRedefined.ts
import { ThemeConfig } from '../types';

export const ProfessionalRedefinedTheme: ThemeConfig = {
  id: 'professional-redefined',
  name: 'Professional Redefined',
  colors: {
    brand: {
      primary: '#507583',
      secondary: '#18aa99',
      tertiary: '#928163',
      alternate: '#ede8df',
    },
    utility: {
      primaryText: '#101518',
      secondaryText: '#576363',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#4c507583',
      accent2: '#4c18aa99',
      accent3: '#4c928163',
      accent4: '#b2ffffff',
    },
    semantic: {
      success: '#16857b',
      error: '#c44454',
      warning: '#f3c344',
      info: '#507583',
    }
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#507583',
        secondary: '#18aa99',
        tertiary: '#928163',
        alternate: '#2f2b26',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#101518',
        secondaryBackground: '#181c1f',
      },
      accent: {
        accent1: '#4c507583',
        accent2: '#4c18aa99',
        accent3: '#4c928163',
        accent4: '#b32f2b26',
      },
      semantic: {
        success: '#16857b',
        error: '#c44454',
        warning: '#f3c344',
        info: '#507583',
      }
    }
  }
};