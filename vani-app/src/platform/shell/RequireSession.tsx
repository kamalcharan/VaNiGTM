'use client';

/**
 * Session guard for the console.
 *
 * Two states have to be distinguished or the guard misbehaves: "no session" and
 * "we do not know yet". On every mount the provider attempts a silent refresh
 * from the httpOnly cookie, and that is asynchronous — redirecting before it
 * resolves would bounce a signed-in user to the login screen on every reload.
 * So we wait for `isLoading` to clear, then decide once.
 *
 * DEV ESCAPE HATCH, deliberate: with no NEXT_PUBLIC_API_ORIGIN there is no API
 * to authenticate against, so the guard stands down and the console renders on
 * the mock transport. That is what keeps UX work possible without a backend —
 * the methodology's "mock, then wire" applied to auth itself. In every
 * deployment the variable is set, so the guard is live.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';

const API_CONFIGURED = !!process.env.NEXT_PUBLIC_API_ORIGIN;

export function RequireSession({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!API_CONFIGURED) return;
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  if (!API_CONFIGURED) return <>{children}</>;
  // Render nothing rather than a spinner: the bootstrap is one request against
  // a warm cookie, and a flashed loader is worse than a beat of nothing.
  if (isLoading || !isAuthenticated) return null;
  return <>{children}</>;
}
