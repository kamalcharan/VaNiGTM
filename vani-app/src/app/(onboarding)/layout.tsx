'use client';

/**
 * Onboarding sits OUTSIDE the console shell on purpose. A gated tenant must not
 * be able to click into the nav and wander around a product they have not
 * finished declaring themselves to.
 *
 * It still needs a session, so RequireSession applies — but not the Shell.
 */

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequireSession } from '@/platform/shell/RequireSession';
import { installSkillTransport } from '@/lib/transport';

installSkillTransport();

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      {/* allowIncomplete: this IS the destination the gate sends people to.
          Without it the guard would bounce them back here forever. */}
      <RequireSession allowIncompleteOnboarding>{children}</RequireSession>
    </QueryClientProvider>
  );
}
