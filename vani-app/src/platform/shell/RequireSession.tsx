'use client';

/**
 * Session and onboarding guard for everything behind sign-in.
 *
 * Three states have to be distinguished or the guard misbehaves: "no session",
 * "we do not know yet", and "signed in but not set up". On every mount the
 * provider attempts a silent refresh from the httpOnly cookie, and that is
 * asynchronous — redirecting before it resolves would bounce a signed-in user
 * to the login screen on every reload. So we wait for `isLoading` to clear,
 * then decide once.
 *
 * The onboarding gate is deliberately blunt: a tenant that has not finished the
 * product lane cannot reach the console. There is no "skip for now", because a
 * skipped declaration is a gap every agent inherits and nothing asks about
 * again. The escape is signing out, which the runner always offers.
 *
 * DEV ESCAPE HATCH, deliberate: with no NEXT_PUBLIC_API_ORIGIN there is no API
 * to authenticate against, so both guards stand down and the console renders on
 * the mock transport. That is what keeps UX work possible without a backend —
 * "mock, then wire" applied to auth itself. In every deployment the variable is
 * set, so the guards are live.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';

const API_CONFIGURED = !!process.env.NEXT_PUBLIC_API_ORIGIN;

interface Props {
  children: ReactNode;
  /**
   * Set on the onboarding route itself. Without it the gate would redirect the
   * destination back to itself, forever.
   */
  allowIncompleteOnboarding?: boolean;
}

export function RequireSession({ children, allowIncompleteOnboarding = false }: Props) {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!API_CONFIGURED) return;
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (needsOnboarding && !allowIncompleteOnboarding) router.replace('/onboarding');
  }, [isAuthenticated, isLoading, needsOnboarding, allowIncompleteOnboarding, router]);

  if (!API_CONFIGURED) return <>{children}</>;
  // Render nothing rather than a spinner: the bootstrap is one request against
  // a warm cookie, and a flashed loader is worse than a beat of nothing.
  if (isLoading || !isAuthenticated) return null;
  if (needsOnboarding && !allowIncompleteOnboarding) return null;
  return <>{children}</>;
}
