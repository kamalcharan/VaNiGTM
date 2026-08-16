'use client';

/**
 * Auth provider — ported from VaNiGTM's frontend/src/context/auth-provider.tsx,
 * reduced to the base slice.
 *
 * Dropped for now, to be restored with the features that need them: TanStack
 * Query (`useMe`), server-driven theme sync, and `switchEnv` for the live/test
 * environment toggle.
 *
 * Kept exactly: the bootstrap. On every mount, if there is no in-memory access
 * token we attempt a silent refresh from the httpOnly cookie. That single
 * effect is what makes reloads, new tabs and cold starts keep their session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { API } from '@/lib/serviceURLs';
import {
  apiFetch,
  clearTokens,
  getAccessToken,
  setAccessToken,
  silentRefresh,
} from '@/lib/api-client';

export interface VaniUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface VaniTenant {
  id: string;
  name: string;
  slug?: string;
}

interface MeResponse {
  user: VaniUser;
  tenant: VaniTenant | null;
}

interface AuthContextValue {
  user: VaniUser | null;
  tenant: VaniTenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<VaniUser | null>(null);
  const [tenant, setTenant] = useState<VaniTenant | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  const hydrate = useCallback(async () => {
    try {
      const me = await apiFetch<MeResponse>(API.auth.me);
      setUser(me.user);
      setTenant(me.tenant ?? null);
    } catch {
      clearTokens();
      setUser(null);
      setTenant(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!getAccessToken()) await silentRefresh();
      if (getAccessToken()) await hydrate();
      if (!cancelled) setBootstrapping(false);
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiFetch<{ access_token: string }>(API.auth.login, {
        body: { email, password },
      });
      setAccessToken(result.access_token);
      await hydrate();
    },
    [hydrate],
  );

  const logout = useCallback(async () => {
    // Clear the in-memory token first so nothing else goes out authenticated,
    // then tell the server to revoke the session and drop the cookie. The
    // client is logged out either way — a failed call must not strand the user.
    clearTokens();
    setUser(null);
    setTenant(null);
    try {
      await apiFetch(API.auth.logout, { body: {} });
    } catch {
      /* already logged out locally */
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        isAuthenticated: !!user,
        isLoading: bootstrapping,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
