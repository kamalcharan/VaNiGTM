/**
 * The three themes, and the rules about which one you get.
 *
 * Adding a fourth is one file under themes/ and one line here.
 */

import type { ColorMode, ThemeConfig } from './types';
import { VikunaBlackTheme } from './themes/vikunaBlack';
import { ModernBusinessTheme } from './themes/modernBusiness';
import { JadeThornTheme } from './themes/jadeThorn';

export const THEMES: ThemeConfig[] = [VikunaBlackTheme, ModernBusinessTheme, JadeThornTheme];

/** The product's own. A new user gets this until they choose otherwise. */
export const DEFAULT_THEME_ID = 'vikuna-black';
export const DEFAULT_MODE: ColorMode = 'dark';

/**
 * Never throws and never returns undefined: an id persisted before a theme was
 * renamed or removed must fall back to the house theme, not leave the console
 * unpainted.
 */
export function getTheme(id: string | null | undefined): ThemeConfig {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function isKnownTheme(id: string | null | undefined): boolean {
  return THEMES.some((t) => t.id === id);
}

export function isMode(v: unknown): v is ColorMode {
  return v === 'light' || v === 'dark';
}

/**
 * Where the choice lives in the browser.
 *
 * The SERVER is the source of truth — `vn_users.preferences` via
 * PATCH /api/v1/auth/preferences, so the choice follows the person to another
 * machine. But a server round trip cannot happen before the first paint, and a
 * console that flashes the wrong theme on every load is worse than one that
 * does not switch at all. So the browser keeps a MIRROR, the pre-paint script
 * reads it, and the server's value overwrites it the moment the session loads.
 */
export const THEME_STORAGE_KEY = 'vani-theme';
export const MODE_STORAGE_KEY = 'vani-mode';
