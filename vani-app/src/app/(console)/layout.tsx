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

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/platform/feedback';
import { RequireSession } from '@/platform/shell/RequireSession';
import { Shell } from '@/platform/shell/Shell';
import { SKILLS } from '@/skills';
import { installSkillTransport } from '@/lib/transport';

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
