// src/context/ThemeContext.tsx
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { Theme } from '../config/theme/types';
import vikunaTheme from '../config/theme/themes/VikunaTheme';

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;
}

// Create context with default values
export const ThemeContext = createContext<ThemeContextType>({
  currentTheme: vikunaTheme,
  setTheme: () => {},
});

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: Theme;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  initialTheme = vikunaTheme 
}) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(initialTheme);
  
  // Function to change theme
  const setTheme = (theme: Theme) => {
    setCurrentTheme(theme);
    // You could store the theme name in localStorage here if needed
    localStorage.setItem('theme', theme.name);
  };

  // Effect to load theme from localStorage on initial render
  useEffect(() => {
    const savedThemeName = localStorage.getItem('theme');
    // Here you would typically load the theme based on the name
    // For now we just use vikunaTheme since it's the only one
    if (savedThemeName && savedThemeName !== currentTheme.name) {
      setCurrentTheme(vikunaTheme);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};