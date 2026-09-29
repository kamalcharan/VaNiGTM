/**
 * The four themes, and the rules about which one you get. Jade Thorn is the
 * default and carries the VaNi Edge palette (themes/jadeThorn.ts).
 *
 * Adding a fourth is one file under themes/ and one line here.
 */

import type { ColorMode, ThemeConfig } from './types';
import { VaniTheme } from './themes/vani';
import { VikunaBlackTheme } from './themes/vikunaBlack';
import { ProfessionalRedefinedTheme } from './themes/professionalRedefined';
import { JadeThornTheme } from './themes/jadeThorn';

export const THEMES: ThemeConfig[] = [
  VaniTheme,
  VikunaBlackTheme,
  ProfessionalRedefinedTheme,
  JadeThornTheme,
];

/**
 * Jade Thorn, light — the VaNi Edge look — for the whole product (Charan,
 * 2026-09-29: "default theme Jadethorn - light for complete product"). It was
 * the signature orange in dark until then; anyone who chose a theme keeps it,
 * because the choice is stored per user and only the fallback moved.
 */
export const DEFAULT_THEME_ID = 'jade-thorn';
export const DEFAULT_MODE: ColorMode = 'light';

/**
 * Never throws and never returns undefined: an id persisted before a theme was
 * renamed or removed must fall back to the house theme, not leave the console
 * unpainted.
 */
export function getTheme(id: string | null | undefined): ThemeConfig {
  // Falls back BY ID, not to THEMES[0]: someone whose stored choice was
  // 'modern-business' — retired on 2026-09-22 — must land on the declared
  // default, and that has to stay true however the array is later reordered.
  return THEMES.find((t) => t.id === id)
    ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)
    ?? THEMES[0];
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
