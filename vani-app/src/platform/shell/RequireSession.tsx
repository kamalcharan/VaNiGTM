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
 * ── Why the gate asks the lane, and not just /me ──────────────────────────
 *
 * `/me` reports `onboarding_complete` as
 * `count(*) FROM vn_tenant_onboarding WHERE status != 'completed') = 0`. That
 * counts ROWS, so a tenant with NO rows counts as complete. The lane's own
 * `/status` reconciles the catalog instead, where an absent row is a PENDING
 * step. The two disagree exactly where it matters:
 *
 *   - Tenants created before registration began seeding steps (auth.service.ts)
 *     have no rows at all, so /me waves them through. Observed in production:
 *     signing in landed straight in the console with nothing onboarded.
 *   - Steps that nothing seeds — every `vani:*` step — can never raise the
 *     count, so enabling them would not gate anyone.
 *
 * So the lane is the authority and `/me` is only a fast pre-signal: it needs no
 * extra request, and for a fresh signup (two seeded pending rows) it blocks
 * immediately. We gate on EITHER saying incomplete.
 *
 * `/me`'s count is deliberately NOT "fixed" to match. It is shared with the GTM
 * frontend, and GTM_LANE carries the same two bare step ids — making that count
 * catalog-aware would abruptly gate live GTM tenants who have no rows. Lane
 * awareness belongs here, per lane, which is the whole point of the lane model.
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
import { useOnboardingStatus } from '@/skills/onboarding/useOnboarding';
import { PRODUCT_LANE_ID } from '@/skills/onboarding/lane';

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

  // Held until a session exists. On the onboarding route the runner owns this
  // query, and it shares the cache key, so asking again here would be noise.
  const askLane = API_CONFIGURED && isAuthenticated && !isLoading && !allowIncompleteOnboarding;
  const lane = useOnboardingStatus(PRODUCT_LANE_ID, askLane);

  // Undecided is its own state. Rendering children here is what let an
  // un-onboarded tenant see the console for a beat before being redirected.
  const laneUndecided = askLane && lane.isPending && !lane.isError;

  // `success: false` arrives with HTTP 200, so check it before trusting `data`.
  // An error or a refusal leaves this false: the gate fails OPEN to /me's
  // answer rather than trapping everyone behind a transient 500.
  const laneIncomplete = lane.data?.success === true && lane.data.data?.complete === false;

  const blocked = !allowIncompleteOnboarding && (needsOnboarding || laneIncomplete);

  useEffect(() => {
    if (!API_CONFIGURED) return;
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (laneUndecided) return;
    if (blocked) router.replace('/onboarding');
  }, [isAuthenticated, isLoading, laneUndecided, blocked, router]);

  if (!API_CONFIGURED) return <>{children}</>;
  // Render nothing rather than a spinner: the bootstrap is one request against
  // a warm cookie, and a flashed loader is worse than a beat of nothing.
  if (isLoading || !isAuthenticated) return null;
  if (laneUndecided) return null;
  if (blocked) return null;
  return <>{children}</>;
}
