// src/context/ThemeContext.tsx
import React, { createContext, useState, ReactNode } from 'react';
import { Theme } from '../config/theme/types';
import { getActiveTheme } from '../config/theme/themeRegistry';

interface ThemeContextType {
  currentTheme: Theme;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const activeTheme = getActiveTheme();

export const ThemeContext = createContext<ThemeContextType>({
  currentTheme: activeTheme,
  theme: activeTheme,
  setTheme: () => {},
});

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: Theme;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialTheme = activeTheme
}) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(initialTheme);

  const setTheme = (theme: Theme) => {
    setCurrentTheme(theme);
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, theme: currentTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
