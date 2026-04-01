'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useMe, type MeUser, type MeTenant } from '@/hooks';
import { clearTokens, getAccessToken } from '@/lib/api-client';

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

  const user = me?.user || null;
  const tenant = me?.tenant || null;
  const isAuthenticated = !!getAccessToken() && !!user;

  function logout() {
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
