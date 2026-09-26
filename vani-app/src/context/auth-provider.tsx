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
  ApiError,
  apiFetch,
  clearTokens,
  getAccessToken,
  readAccessToken,
  setAccessToken,
  silentRefresh,
} from '@/lib/api-client';
import { clearGate } from '@/lib/gate';

export interface VaniUser {
  id: string;
  email: string;
  name?: string | null;
  /**
   * `vn_users.preferences`, returned by /auth/me and written by
   * PATCH /auth/preferences. The theme choice lives here so it follows the
   * person to another machine; the browser only keeps a mirror of it to paint
   * before this response lands.
   */
  preferences?: {
    theme_override?: string | null;
    color_mode?: string | null;
    [key: string]: unknown;
  } | null;
}

export interface VaniTenant {
  id: string;
  name: string;
  slug?: string;
  /**
   * From /api/v1/auth/me. NOTE: this is VaNiGTM's legacy count across ALL of a
   * tenant's onboarding rows, so it is not the VaNi product lane's answer. The
   * lane's own status comes from GET /onboarding/status?lane=vani.
   *
   * It is still the right thing to gate on at bootstrap: it is already in the
   * payload we fetch anyway, so the gate costs no extra round trip, and the
   * runner corrects itself against the lane the moment it loads.
   */
  onboarding_complete?: boolean;
  /**
   * vn_tenants.is_admin, from /api/v1/auth/me. An admin tenant is Vikuna
   * itself: it may feed the common pool and read it. The server re-checks
   * the JWT on every such call; this only decides what the console offers.
   */
  is_admin?: boolean;
}

interface MeResponse {
  user: VaniUser;
  tenant: VaniTenant | null;
}

/** What the caller collects on the signup form. Mirrors validateRegisterInput. */
export interface SignupInput {
  name: string;
  email: string;
  password: string;
  /** Optional. Unset, the backend names the tenant "<name>'s Workspace". */
  tenant_name?: string;
}

interface AuthContextValue {
  user: VaniUser | null;
  tenant: VaniTenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Signed in, but the product lane is not finished. Drives the gate. */
  needsOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Re-read /api/v1/auth/me.
   *
   * Required, not a convenience. `needsOnboarding` is derived from the tenant
   * snapshot taken at bootstrap, so anything that changes onboarding state must
   * refresh it before navigating — otherwise the gate acts on a stale answer and
   * bounces the user straight back to the wizard they just finished.
   */
  refresh: () => Promise<void>;
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
      const result = await apiFetch<unknown>(API.auth.login, {
        body: { email, password },
      });
      const token = readAccessToken(result);
      if (!token) throw new ApiError('Sign-in did not return a session.', 0);
      setAccessToken(token);
      await hydrate();
    },
    [hydrate],
  );

  /**
   * Register a tenant and its first user, then sign them straight in — the
   * backend issues tokens and sets the refresh cookie on 201, so there is no
   * reason to bounce a new user to the login screen to retype what they typed
   * ten seconds ago.
   *
   * The signup gate is consumed on success: one passage, one account.
   */
  const signup = useCallback(
    async (input: SignupInput) => {
      const body: Record<string, string> = {
        name: input.name,
        email: input.email,
        password: input.password,
      };
      if (input.tenant_name) body.tenant_name = input.tenant_name;

      const result = await apiFetch<unknown>(API.auth.register, { body });
      const token = readAccessToken(result);
      if (!token) throw new ApiError('Registration did not return a session.', 0);
      setAccessToken(token);
      clearGate();
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
        refresh: hydrate,
        isAuthenticated: !!user,
        isLoading: bootstrapping,
        // Absent means "not reported" — treat as done. A missing field must
        // never lock a tenant out of the product.
        needsOnboarding: !!user && tenant?.onboarding_complete === false,
        login,
        signup,
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
