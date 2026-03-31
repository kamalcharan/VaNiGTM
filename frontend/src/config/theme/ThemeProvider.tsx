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

const ENV_DEFAULT_MODE = (
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEFAULT_COLOR_MODE === 'light'
    ? 'light'
    : 'dark'
) as 'light' | 'dark';

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
    // Surface / Glass
    '--glass': colors.surface.glass,
    '--glass-strong': colors.surface.glassStrong,
    '--glass-border': colors.surface.glassBorder,
    '--color-primary-dim': colors.surface.primaryDim,
    '--color-primary-glow': colors.surface.primaryGlow,
    '--color-primary-subtle': colors.surface.primarySubtle,
    // Derived
    '--color-border': colors.surface.glassBorder,
    '--color-surface-hover': isDark
      ? `${colors.utility.secondaryBackground}cc`
      : colors.utility.primaryBackground,
    '--color-primary-fg': isDark ? colors.utility.primaryBackground : '#ffffff',
    '--color-primary-hover': colors.brand.primary + 'dd',
    // Text convenience aliases
    '--text-secondary': colors.utility.secondaryText,
    '--text-muted': isDark ? 'rgba(240,236,226,0.35)' : 'rgba(26,26,31,0.4)',
    // Gold convenience aliases (backward compat with Atlas overlay)
    '--gold-dim': colors.surface.primaryDim,
    '--gold-glow': colors.surface.primaryGlow,
    '--gold-subtle': colors.surface.primarySubtle,
  };
}

function getInitialTheme(defaultId: string): string {
  if (typeof window === 'undefined') return defaultId;
  try {
    const saved = localStorage.getItem('pk-theme-id');
    if (saved && getTheme(saved).id === saved) return saved;
  } catch {}
  return defaultId;
}

function getInitialMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return ENV_DEFAULT_MODE;
  try {
    const saved = localStorage.getItem('pk-color-mode');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return ENV_DEFAULT_MODE;
}

export function ThemeProvider({ children, defaultThemeId = 'vikuna-black' }: { children: ReactNode; defaultThemeId?: string }) {
  const [themeId, setThemeId] = useState(() => getInitialTheme(defaultThemeId));
  const [colorMode, setColorMode] = useState<'light' | 'dark'>(() => getInitialMode());

  const theme = getTheme(themeId);

  // Apply CSS variables to :root on theme/mode change
  // ThemeScript handles the initial paint; this handles runtime changes
  useEffect(() => {
    const vars = themeToCSS(theme, colorMode === 'dark');
    const root = document.documentElement;
    Object.entries(vars).forEach(([prop, value]) => {
      root.style.setProperty(prop, value);
    });
    root.style.setProperty('color-scheme', colorMode);
  }, [theme, colorMode]);

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
