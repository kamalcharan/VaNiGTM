'use client';

/**
 * The theme, at runtime.
 *
 * Three sources, in this order of authority:
 *
 *   1. What the person just clicked          — applied instantly
 *   2. `vn_users.preferences` from /auth/me  — the truth, follows them anywhere
 *   3. the browser's mirror                  — only to paint before (2) arrives
 *
 * The mirror exists because a server round trip cannot happen before the first
 * paint, and a console that flashes the wrong theme on every load feels broken.
 * It is a cache, never the record: signing in on a second machine must bring
 * the choice with it, which is the whole point of persisting per user.
 *
 * SAVING IS NOT SILENT. A failed PATCH leaves the theme applied here and says
 * so, because "it looked like it worked and was gone tomorrow" is the exact
 * degradation rule 12 forbids. It does not roll the colour back — reverting
 * under someone's cursor is worse than telling them.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/platform/feedback';
import { useAuth } from '@/context/auth-provider';
import {
  DEFAULT_MODE, DEFAULT_THEME_ID, MODE_STORAGE_KEY, THEME_STORAGE_KEY,
  THEMES, getTheme, isKnownTheme, isMode,
} from '@/config/theme/registry';
import type { ColorMode, ThemeConfig } from '@/config/theme/types';

interface ThemeContextValue {
  themeId: string;
  mode: ColorMode;
  theme: ThemeConfig;
  themes: ThemeConfig[];
  setThemeId: (id: string) => void;
  setMode: (mode: ColorMode) => void;
  toggleMode: () => void;
  /** True while a choice is on its way to the server. */
  saving: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Read/write the mirror. Both throw in a private window; neither may break the app. */
function readMirror(): { themeId: string; mode: ColorMode } {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    const m = localStorage.getItem(MODE_STORAGE_KEY);
    return {
      themeId: isKnownTheme(t) ? (t as string) : DEFAULT_THEME_ID,
      mode: isMode(m) ? m : DEFAULT_MODE,
    };
  } catch {
    return { themeId: DEFAULT_THEME_ID, mode: DEFAULT_MODE };
  }
}

function writeMirror(themeId: string, mode: ColorMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch { /* private window — the server still has it */ }
}

/**
 * Apply by ATTRIBUTE, not by writing forty inline styles.
 *
 * ThemeScript already emitted a rule per theme × mode into the document head,
 * so switching is two attribute writes and the browser does the rest. Setting
 * the properties from JS instead would mean the palette exists in two places.
 */
function applyToDocument(themeId: string, mode: ColorMode) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.setAttribute('data-theme', themeId);
  el.setAttribute('data-mode', mode);
  // So form controls, scrollbars and the browser's own UI follow.
  el.style.colorScheme = mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID);
  const [mode, setModeState] = useState<ColorMode>(DEFAULT_MODE);
  const [saving, setSaving] = useState(false);

  // The mirror is read after mount, never during render: the server render has
  // no localStorage, and reading it in useState would make the first client
  // render disagree with the HTML and trip hydration.
  useEffect(() => {
    const m = readMirror();
    setThemeIdState(m.themeId);
    setModeState(m.mode);
    applyToDocument(m.themeId, m.mode);
  }, []);

  // The server's answer wins over the mirror — once, when the session lands.
  // Guarded by a ref so a later /auth/me refetch cannot yank the theme out from
  // under someone who has just changed it in this tab.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !user) return;
    adopted.current = true;
    const prefs = user.preferences ?? {};
    const serverTheme = typeof prefs.theme_override === 'string' ? prefs.theme_override : null;
    const serverMode = typeof prefs.color_mode === 'string' ? prefs.color_mode : null;
    if (!isKnownTheme(serverTheme) && !isMode(serverMode)) return;

    const nextTheme = isKnownTheme(serverTheme) ? (serverTheme as string) : themeId;
    const nextMode = isMode(serverMode) ? serverMode : mode;
    setThemeIdState(nextTheme);
    setModeState(nextMode);
    applyToDocument(nextTheme, nextMode);
    writeMirror(nextTheme, nextMode);
  }, [user, themeId, mode]);

  const persist = useCallback(async (nextTheme: string, nextMode: ColorMode) => {
    // Signed out — the gate and the login screen are themed too, and there is
    // nobody to persist against. The mirror carries it until they sign in.
    if (!user) return;
    setSaving(true);
    try {
      await apiFetch(API.auth.preferences, {
        body: { theme_override: nextTheme, color_mode: nextMode },
      });
    } catch (err) {
      showToast({
        message: err instanceof Error
          ? `Theme applied here, but not saved to your account: ${err.message}`
          : 'Theme applied here, but could not be saved to your account.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [user, showToast]);

  const setThemeId = useCallback((id: string) => {
    if (!isKnownTheme(id)) return;
    setThemeIdState(id);
    applyToDocument(id, mode);
    writeMirror(id, mode);
    void persist(id, mode);
  }, [mode, persist]);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    applyToDocument(themeId, next);
    writeMirror(themeId, next);
    void persist(themeId, next);
  }, [themeId, persist]);

  const toggleMode = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(() => ({
    themeId, mode, theme: getTheme(themeId), themes: THEMES,
    setThemeId, setMode, toggleMode, saving,
  }), [themeId, mode, setThemeId, setMode, toggleMode, saving]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
