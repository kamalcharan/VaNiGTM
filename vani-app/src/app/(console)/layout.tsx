'use client';

/**
 * Console layout. Wires the query client and the skill transport, then renders
 * the shell from the registry.
 *
 * P0 runs on the mock transport and a stand-in tenant — auth arrives in P1, at
 * which point the transport swaps to live and the org details come from
 * /api/v1/auth/me. Neither change should require touching a screen.
 */

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shell } from '@/platform/shell/Shell';
import { SKILLS } from '@/skills';
import { setSkillTransport } from '@/lib/useSkill';
import { mockTransport } from '@/lib/mock-transport';

setSkillTransport(mockTransport);

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );

  return (
    <QueryClientProvider client={qc}>
      {/* P0 has no session to end, so sign-out returns to the public story.
          P1 replaces this with the real logout, which revokes server-side. */}
      <Shell
        skills={SKILLS}
        org="Vikuna Technologies"
        slug="vikuna"
        onSignOut={() => router.push('/')}
      >
        {children}
      </Shell>
    </QueryClientProvider>
  );
}
