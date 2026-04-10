'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMe, useInvalidateMe, type MeUser, type MeTenant } from '@/hooks';
import { apiFetch, clearTokens, getAccessToken, getRefreshToken, storeTokens } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useTheme } from '@/config/theme';

/* ── Types ───────────────────────────────────────────── */

interface AuthContextValue {
  user: MeUser | null;
  tenant: MeTenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLive: boolean;
  isAdmin: boolean;
  logout: () => void;
  switchEnv: (live: boolean) => Promise<void>;
}

/* ── Context ─────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Provider (real auth via useMe + JWT) ────────────── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const invalidateMe = useInvalidateMe();
  const queryClient = useQueryClient();
  const { setTheme, themeId } = useTheme();

  const user = me?.user || null;
  const tenant = me?.tenant || null;
  const isAuthenticated = !!getAccessToken() && !!user;
  const isLive: boolean = tenant?.is_live !== false;
  const isAdmin: boolean = tenant?.is_admin === true;

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

  async function switchEnv(live: boolean): Promise<void> {
    const result = await apiFetch<{ access_token: string; expires_in: number; is_live: boolean }>(
      API.auth.switchEnv,
      { body: { is_live: live } },
    );
    // Replace only the access token — refresh token is unchanged
    const TOKEN_ACCESS = 'pk-access-token';
    const expiresAt = String(Date.now() + result.expires_in * 1000);
    try {
      sessionStorage.setItem(TOKEN_ACCESS, result.access_token);
      sessionStorage.setItem('pk-token-expires-at', expiresAt);
      localStorage.setItem(TOKEN_ACCESS, result.access_token);
      localStorage.setItem('pk-token-expires-at', expiresAt);
    } catch { /* storage unavailable */ }
    // Invalidate useMe so the sidebar env pill updates immediately
    invalidateMe();
    // Flush ALL skill query caches — every data page refetches with the new JWT
    // (is_live is baked into the JWT, so cached responses from the old env must go)
    await queryClient.invalidateQueries({ queryKey: ['skill'] });
  }

  return (
    <AuthContext.Provider value={{ user, tenant, isAuthenticated, isLoading, isLive, isAdmin, logout, switchEnv }}>
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
