'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/* ── Types ───────────────────────────────────────────── */

export interface ActiveSession {
  session_id: string;
  browser: string;
  os: string;
  device_type: string;
  ip_address: string;
  last_activity_at: string;
}

export interface SessionLimitResponse {
  code: 'SESSION_LIMIT';
  max_sessions: number;
  active_sessions: ActiveSession[];
}

interface User {
  id: string;
  email: string;
  name: string;
  role_id: string;
  avatar_url?: string;
  preferences?: Record<string, unknown>;
}

interface Tenant {
  id: string;
  name: string;
  theme_id: string;
  logo_url?: string;
  onboarding_complete: boolean;
}

type LoginResult = { success: true } | SessionLimitResponse;

interface AuthContextValue {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  revokeSessions: (ids: string[], email: string, password: string) => Promise<LoginResult>;
  getAuthHeaders: () => Record<string, string>;
}

/* ── Context ─────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Mock data for UI development ────────────────────── */

const MOCK_USER: User = {
  id: 'dev-user-001',
  email: 'demo@kiprime.com',
  name: 'Rajesh Kumar',
  role_id: 'owner',
};

const MOCK_TENANT: Tenant = {
  id: 'dev-tenant-001',
  name: 'Kumar Wealth Advisors',
  theme_id: 'vikuna-black',
  onboarding_complete: false,
};

/* ── Provider ────────────────────────────────────────── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  const isAuthenticated = !!user;

  const login = useCallback(async (_email: string, _password: string): Promise<LoginResult> => {
    // Mock: simulate login
    setUser(MOCK_USER);
    setTenant(MOCK_TENANT);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setTenant(null);
    // In production: clear tokens, call logout endpoint
  }, []);

  const revokeSessions = useCallback(async (
    _ids: string[],
    _email: string,
    _password: string,
  ): Promise<LoginResult> => {
    // Mock: just succeed
    setUser(MOCK_USER);
    setTenant(MOCK_TENANT);
    return { success: true };
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    // Mock: return dev header
    return { 'X-Dev-Tenant-Id': MOCK_TENANT.id };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      tenant,
      isAuthenticated,
      login,
      logout,
      revokeSessions,
      getAuthHeaders,
    }}>
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
