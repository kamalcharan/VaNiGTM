'use client';

/**
 * Vara workspace shell.
 *
 * Per Charan's decision 2026-08-17: clicking Vara opens Vara AS ITS OWN
 * WORKSPACE within the same session — the console's general nav is replaced
 * with Vara's own sidebar (Landing / Onboarding / JD Studio / Pulse /
 * Probability Map / Closing Window / Calibration), a persona switcher lives
 * top-right, and a "Back to VaNi" button always returns to the general
 * console.
 *
 * Not a rebuild — the same generic `Shell` renders, given a Vara-only skill
 * list. This wrapper adds the top bar with the back button and persona
 * switcher, and swaps the sidebar catalog. When Nova arrives, it does the
 * same trick with its own catalog and everything else is shared.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequireSession } from '@/platform/shell/RequireSession';
import { Shell } from '@/platform/shell/Shell';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/platform/feedback';
import { installSkillTransport } from '@/lib/transport';
import { VARA_SKILLS } from '@/skills/vara-shell/vara-nav';
import s from './vara-shell.module.css';

installSkillTransport();

type Persona = 'recruiter' | 'hm' | 'operator';

/** Which surfaces a persona sees. v1 is a visual switcher; per-role login
 *  enforcement lands later. */
const PERSONA_LABEL: Record<Persona, string> = {
  recruiter: 'Recruiter',
  hm: 'Hiring Manager',
  operator: 'Vikuna Operator',
};

export default function VaraShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { tenant, logout } = useAuth();
  const toast = useToast();
  const [persona, setPersona] = useState<Persona>('recruiter');
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );

  async function handleSignOut() {
    await logout();
    qc.clear();
    toast.info('Signed out.');
    router.replace('/');
  }

  return (
    <QueryClientProvider client={qc}>
      <RequireSession>
        <Shell
          skills={VARA_SKILLS}
          org={tenant?.name || 'Vikuna Technologies'}
          slug={tenant?.slug || 'vikuna'}
          onSignOut={handleSignOut}
        >
          <div className={s.top}>
            <Link href="/dashboard" className={s.back}>← Back to VaNi</Link>
            <div className={s.crumbs}>
              <span>Vara</span>
              <span>·</span>
              <span className={s.crumbCurr}>Talent workspace</span>
            </div>
            <div className={s.persona} role="tablist" aria-label="View as">
              {(['recruiter', 'hm', 'operator'] as Persona[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={persona === p}
                  className={
                    persona === p ? `${s.personaBtn} ${s.personaBtnActive}` : s.personaBtn
                  }
                  onClick={() => setPersona(p)}
                >
                  <span className={s.personaDot} aria-hidden="true" />
                  {PERSONA_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          {children}
        </Shell>
      </RequireSession>
    </QueryClientProvider>
  );
}
