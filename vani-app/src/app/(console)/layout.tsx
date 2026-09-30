'use client';

/**
 * Console layout. Guards the session, wires the query client and the skill
 * transport, then renders the shell from the registry.
 *
 * The transport is selected by config — live when NEXT_PUBLIC_API_ORIGIN is set,
 * mock otherwise. That swap touched this file and one new module, and no screen,
 * which is the seam working as intended. Org name and slug come from
 * /api/v1/auth/me.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/platform/feedback';
import { RequireSession } from '@/platform/shell/RequireSession';
import { Shell } from '@/platform/shell/Shell';
import { SKILLS } from '@/skills';
import { installSkillTransport, IS_LIVE } from '@/lib/transport';

installSkillTransport();

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { tenant, logout } = useAuth();
  const toast = useToast();
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );

  // Admin-only routes (access requests) are dropped for a tenant that is not
  // Vikuna's own — the same rule GtmShell applies to the common pool. In mock
  // mode there is no session, so everything shows.
  const isAdmin = !IS_LIVE || tenant?.is_admin === true;
  const skills = useMemo(
    () => (isAdmin ? SKILLS : SKILLS.map((sk) => ({ ...sk, routes: sk.routes.filter((r) => !r.adminOnly) }))),
    [isAdmin],
  );

  async function handleSignOut() {
    // Revoke server-side first, then clear the client's cached queries — a
    // stale cache surviving a sign-out is how the next user sees the last
    // user's data. logout() never throws; it clears locally either way.
    await logout();
    qc.clear();
    toast.info('Signed out.');
    router.replace('/');
  }

  return (
    <QueryClientProvider client={qc}>
      <RequireSession>
        <Shell
          skills={skills}
          org={tenant?.name || 'Vikuna Technologies'}
          slug={tenant?.slug || 'vikuna'}
          onSignOut={handleSignOut}
        >
          {children}
        </Shell>
      </RequireSession>
    </QueryClientProvider>
  );
}
