export interface ThemeColors {
  brand: {
    primary: string;
    secondary: string;
    tertiary: string;
    alternate: string;
  };
  utility: {
    primaryText: string;
    secondaryText: string;
    primaryBackground: string;
    secondaryBackground: string;
  };
  accent: {
    accent1: string;
    accent2: string;
    accent3: string;
    accent4: string;
  };
  semantic: {
    success: string;
    error: string;
    warning: string;
    info: string;
  };
  surface: {
    glass: string;
    glassStrong: string;
    glassBorder: string;
    primaryDim: string;
    primaryGlow: string;
    primarySubtle: string;
  };
}

export interface ThemeConfig {
  id: string;
  name: string;
  colors: ThemeColors;
  darkMode: {
    colors: ThemeColors;
  };
}

export interface ThemeContextType {
  currentTheme: ThemeConfig;
  isDarkMode: boolean;
  setTheme: (themeId: string) => void;
  toggleDarkMode: () => void;
}
