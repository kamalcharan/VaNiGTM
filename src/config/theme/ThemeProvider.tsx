'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ThemeConfig } from './types';
import { themes, defaultTheme, getTheme } from './registry';

interface ThemeContextValue {
  themeId: string;
  theme: ThemeConfig;
  colorMode: 'light' | 'dark';
  setTheme: (id: string) => void;
  toggleColorMode: () => void;
  themes: { id: string; name: string }[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function themeToCSS(theme: ThemeConfig, isDark: boolean): Record<string, string> {
  const colors = isDark ? theme.darkMode.colors : theme.colors;
  return {
    // Brand
    '--color-primary': colors.brand.primary,
    '--color-secondary': colors.brand.secondary,
    '--color-tertiary': colors.brand.tertiary,
    '--color-alternate': colors.brand.alternate,
    // Utility
    '--color-fg': colors.utility.primaryText,
    '--color-muted': colors.utility.secondaryText,
    '--color-bg': colors.utility.primaryBackground,
    '--color-surface': colors.utility.secondaryBackground,
    // Accent
    '--color-accent': colors.accent.accent1,
    '--color-accent2': colors.accent.accent2,
    '--color-accent3': colors.accent.accent3,
    '--color-accent4': colors.accent.accent4,
    // Semantic
    '--color-success': colors.semantic.success,
    '--color-danger': colors.semantic.error,
    '--color-warning': colors.semantic.warning,
    '--color-info': colors.semantic.info,
    // Derived (commonly needed by components)
    '--color-border': isDark
      ? `${colors.utility.secondaryText}30`
      : `${colors.utility.secondaryText}20`,
    '--color-surface-hover': isDark
      ? `${colors.utility.secondaryBackground}cc`
      : `${colors.utility.primaryBackground}`,
    '--color-primary-fg': '#ffffff',
    '--color-primary-hover': colors.brand.primary + 'dd',
  };
}

export function ThemeProvider({ children, defaultThemeId = 'vikuna-black' }: { children: ReactNode; defaultThemeId?: string }) {
  const [themeId, setThemeId] = useState(defaultThemeId);
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('dark');

  const theme = getTheme(themeId);

  // Apply CSS variables to :root
  useEffect(() => {
    const vars = themeToCSS(theme, colorMode === 'dark');
    const root = document.documentElement;
    Object.entries(vars).forEach(([prop, value]) => {
      root.style.setProperty(prop, value);
    });
    // Set color-scheme for native elements
    root.style.setProperty('color-scheme', colorMode);
  }, [theme, colorMode]);

  // Load saved preferences
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('pk-theme-id');
      const savedMode = localStorage.getItem('pk-color-mode');
      if (savedTheme && getTheme(savedTheme).id === savedTheme) setThemeId(savedTheme);
      if (savedMode === 'light' || savedMode === 'dark') setColorMode(savedMode);
    } catch { /* SSR or localStorage unavailable */ }
  }, []);

  const handleSetTheme = useCallback((id: string) => {
    setThemeId(id);
    try { localStorage.setItem('pk-theme-id', id); } catch {}
  }, []);

  const toggleColorMode = useCallback(() => {
    setColorMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('pk-color-mode', next); } catch {}
      return next;
    });
  }, []);

  const themeList = themes.map(t => ({ id: t.id, name: t.name }));

  return (
    <ThemeContext.Provider value={{
      themeId,
      theme,
      colorMode,
      setTheme: handleSetTheme,
      toggleColorMode,
      themes: themeList,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
