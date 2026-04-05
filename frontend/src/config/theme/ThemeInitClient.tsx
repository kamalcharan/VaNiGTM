'use client';

import { useLayoutEffect } from 'react';

interface ThemeInitClientProps {
  themeMap: Record<string, { light: string; dark: string }>;
  defaultThemeId: string;
  defaultColorMode: string;
}

/**
 * Client component that applies the user's saved theme from localStorage.
 *
 * Uses useLayoutEffect (runs synchronously before browser paint) to minimize
 * the flash between SSR default theme and saved theme.
 *
 * No <script> tag in the React tree = no React 19 console warning.
 */
export function ThemeInitClient({ themeMap, defaultThemeId, defaultColorMode }: ThemeInitClientProps) {
  useLayoutEffect(() => {
    try {
      const savedTheme = localStorage.getItem('pk-theme-id') || defaultThemeId;
      const savedMode = localStorage.getItem('pk-color-mode') || defaultColorMode;

      // Skip if using default (SSR already rendered correctly)
      if (savedTheme === defaultThemeId && savedMode === defaultColorMode) return;

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
