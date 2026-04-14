'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMe, useInvalidateMe, type MeUser, type MeTenant } from '@/hooks';
import {
  apiFetch,
  clearTokens,
  getAccessToken,
  setAccessToken,
  silentRefresh,
  storeTokens,
} from '@/lib/api-client';
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

/* ── Provider ────────────────────────────────────────── */

export function AuthProvider({ children }: { children: ReactNode }) {
  // bootstrapping: true while we attempt to restore the session via httpOnly cookie.
  // useMe is suppressed until bootstrap completes so it doesn't fire with no token.
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    // On every app mount, if there is no in-memory access token, try to restore
    // the session using the httpOnly refresh cookie (browser sends it automatically).
    // This handles page reloads, new tabs, and cold starts.
    async function bootstrap() {
      if (!getAccessToken()) {
        await silentRefresh(); // sets _accessToken on success; noop on failure
      }
      setBootstrapping(false);
    }
    bootstrap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: me, isLoading: meLoading } = useMe({
    enabled: !bootstrapping && !!getAccessToken(),
  });

  const invalidateMe = useInvalidateMe();
  const queryClient = useQueryClient();
  const { setTheme, themeId } = useTheme();

  const user = me?.user || null;
  const tenant = me?.tenant || null;
  const isAuthenticated = !!getAccessToken() && !!user;
  const isLive: boolean = tenant?.is_live !== false;
  const isAdmin: boolean = tenant?.is_admin === true;
  // isLoading covers the bootstrap phase AND the subsequent useMe fetch
  const isLoading = bootstrapping || meLoading;

  // Sync theme from server (user.preferred_theme) → ThemeProvider
  // Skip during onboarding — user hasn't chosen a theme yet.
  useEffect(() => {
    if (!user) return;
    if (!tenant?.onboarding_complete) return;

    const serverTheme = (user as any).preferred_theme;
    if (serverTheme && serverTheme !== themeId) {
      setTheme(serverTheme);
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
  }, [user, tenant?.onboarding_complete]); // eslint-disable-line react-hooks/exhaustive-deps

  function logout() {
    // Clear in-memory token immediately so no further requests go out
    clearTokens();
    // Call logout endpoint — backend clears the httpOnly cookie and revokes the DB session.
    // Fire-and-forget for instant UX; we redirect regardless of outcome.
    apiFetch(API.auth.logout, { body: {} }).catch(() => {});
    window.location.href = '/login';
  }

  async function switchEnv(live: boolean): Promise<void> {
    const result = await apiFetch<{ access_token: string; expires_in: number; is_live: boolean }>(
      API.auth.switchEnv,
      { body: { is_live: live } },
    );
    // Replace the in-memory access token (refresh token/cookie unchanged for env switch)
    setAccessToken(result.access_token);
    // Invalidate useMe so the sidebar env pill updates immediately
    invalidateMe();
    // Flush ALL skill query caches — is_live is baked into the JWT, cached data from
    // the old env must be discarded.
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
