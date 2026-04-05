'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useMe, type MeUser, type MeTenant } from '@/hooks';
import { apiFetch, clearTokens, getAccessToken, getRefreshToken } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useTheme } from '@/config/theme';

/* ── Types ───────────────────────────────────────────── */

interface AuthContextValue {
  user: MeUser | null;
  tenant: MeTenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
}

/* ── Context ─────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Provider (real auth via useMe + JWT) ────────────── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const { setTheme, themeId } = useTheme();

  const user = me?.user || null;
  const tenant = me?.tenant || null;
  const isAuthenticated = !!getAccessToken() && !!user;

  // Sync theme from server (user.preferred_theme) → ThemeProvider
  // This ensures the theme matches what the user saved, even on first load
  useEffect(() => {
    if (!user) return;

    const serverTheme = (user as any).preferred_theme;
    if (serverTheme && serverTheme !== themeId) {
      setTheme(serverTheme);
      // Also persist to localStorage for next SSR-to-client transition
      try { localStorage.setItem('pk-theme-id', serverTheme); } catch {}
    }

    const prefs = user.preferences as Record<string, any> | undefined;
    const serverMode = prefs?.color_mode;
    if (serverMode) {
      try {
        const current = localStorage.getItem('pk-color-mode');
        if (current !== serverMode) {
          localStorage.setItem('pk-color-mode', serverMode);
        }
      } catch {}
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function logout() {
    // Fire-and-forget: revoke the specific session in DB by sending the refresh token
    // Don't await — clear tokens and redirect immediately for instant UX
    const refreshToken = getRefreshToken();
    apiFetch(API.auth.logout, {
      body: refreshToken ? { refresh_token: refreshToken } : {},
    }).catch(() => {});
    clearTokens();
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, tenant, isAuthenticated, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ── Hook ────────────────────────────────────────────── */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
