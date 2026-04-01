'use client';

import { useEffect } from 'react';

interface ThemeInitClientProps {
  themeMap: Record<string, { light: string; dark: string }>;
  defaultThemeId: string;
  defaultColorMode: string;
}

/**
 * Client component that applies the user's saved theme from localStorage.
 *
 * Runs in useEffect after hydration. The SSR fallback <style> in ThemeScript
 * ensures the default theme is visible immediately — this component only
 * swaps CSS variables if the user has a different saved theme.
 *
 * No <script> tag in the React tree = no React 19 console warning.
 */
export function ThemeInitClient({ themeMap, defaultThemeId, defaultColorMode }: ThemeInitClientProps) {
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('pk-theme-id') || defaultThemeId;
      const savedMode = localStorage.getItem('pk-color-mode') || defaultColorMode;
      const entry = themeMap[savedTheme] || themeMap[defaultThemeId];
      if (!entry) return;
      const css = savedMode === 'dark' ? entry.dark : entry.light;
      document.documentElement.style.cssText += ';' + css;
    } catch {
      // localStorage unavailable
    }
  }, [themeMap, defaultThemeId, defaultColorMode]);

  return null;
}
