// src/config/theme/themeRegistry.ts
// Config-driven theme selection — change ACTIVE_THEME to switch themes site-wide

import { Theme } from './types';
import darkEditorialTheme from './themes/DarkEditorialTheme';
import trustworthyTheme from './themes/TrustworthyTheme';
import vikunaTheme from './themes/VikunaTheme';
import techAITheme from './themes/TechAITheme';
import modernBusinessTheme from './themes/ModernBusinessTheme';

// ─── All available themes ──────────────────────────────────────
export const themes: Record<string, Theme> = {
  'dark-editorial': darkEditorialTheme,
  'trustworthy-professional': trustworthyTheme,
  'vikuna': vikunaTheme,
  'tech-ai': techAITheme,
  'modern-business': modernBusinessTheme,
};

// ─── SET ACTIVE THEME HERE ─────────────────────────────────────
// Change this value to switch the site's theme.
// Must match one of the keys in the `themes` object above.
export const ACTIVE_THEME = 'dark-editorial';
// ────────────────────────────────────────────────────────────────

export const getActiveTheme = (): Theme => {
  const theme = themes[ACTIVE_THEME];
  if (!theme) {
    console.warn(`Theme "${ACTIVE_THEME}" not found. Falling back to dark-editorial.`);
    return darkEditorialTheme;
  }
  return theme;
};

export const getThemeByName = (name: string): Theme | undefined => {
  return themes[name];
};
