import { ThemeConfig } from '../types';

export const ClassicElegantTheme: ThemeConfig = {
  id: 'classic-elegant',
  name: 'Classic & Elegant',
  colors: {
    brand: {
      primary: '#4b998c',
      secondary: '#928163',
      tertiary: '#c6604a',
      alternate: '#c587c4',
    },
    utility: {
      primaryText: '#0b191e',
      secondaryText: '#384e58',
      primaryBackground: '#f1f4f8',
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#444b598c',
      accent2: '#445f28163',
      accent3: '#4c6d604a',
      accent4: '#cfffffff',
    },
    semantic: {
      success: '#336a4a',
      error: '#c4454d',
      warning: '#f3c344',
      info: '#ffffff',
    }
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#4b496cc',
        secondary: '#928163',
        tertiary: '#c6604a',
        alternate: '#7282e',
      },
      utility: {
        primaryText: '#ffffff',
        secondaryText: '#95a1ac',
        primaryBackground: '#0b191e',
        secondaryBackground: '#131f24',
      },
      accent: {
        accent1: '#44db986c',
        accent2: '#4d928163',
        accent3: '#dc6d004a',
        accent4: '#b20cb7be',
      },
      semantic: {
        success: '#336ada',
        error: '#c4454d',
        warning: '#f3c344',
        info: '#ffffff',
      }
    }
  }
};