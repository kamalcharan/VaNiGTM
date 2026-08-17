'use client';

/**
 * Console layout. Guards the session, wires the query client and the skill
 * transport, then renders the shell from the registry.
 *
 * Still on the mock transport: swapping it for a live one is the last piece of
 * P1 and touches this file only, which is the seam working as intended. The org
 * name and slug now come from /api/v1/auth/me rather than being hardcoded.
 */

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-provider';
import { RequireSession } from '@/platform/shell/RequireSession';
import { Shell } from '@/platform/shell/Shell';
import { SKILLS } from '@/skills';
import { setSkillTransport } from '@/lib/useSkill';
import { mockTransport } from '@/lib/mock-transport';

setSkillTransport(mockTransport);

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { tenant, logout } = useAuth();
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );

  async function handleSignOut() {
    // Revoke server-side first, then clear the client's cached queries — a
    // stale cache surviving a sign-out is how the next user sees the last
    // user's data. logout() never throws; it clears locally either way.
    await logout();
    qc.clear();
    router.replace('/');
  }

  return (
    <QueryClientProvider client={qc}>
      <RequireSession>
        <Shell
          skills={SKILLS}
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
