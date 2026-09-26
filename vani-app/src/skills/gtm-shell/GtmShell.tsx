'use client';
/**
 * GTM workspace shell — the same generic `Shell`, given GTM's catalog, with a
 * top bar that carries the way back. No persona switcher: GTM has one persona
 * for now (the person who sells), and a switcher with one option is noise.
 *
 * Lives in the skill folder, not in platform/shell/ (where Vara's sits —
 * slightly over the line; not worth a migration of its own). Zero platform
 * edits: gtm-migration-poa.md §1.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequireSession } from '@/platform/shell/RequireSession';
import { Shell } from '@/platform/shell/Shell';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/platform/feedback';
import { installSkillTransport, IS_LIVE } from '@/lib/transport';
import { GTM_SKILLS } from './gtm-nav';
import s from './gtm-shell.module.css';
import { PreviewBadge } from './PreviewBadge';

installSkillTransport();

export default function GtmShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { tenant, logout } = useAuth();
  const toast = useToast();
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }),
  );
  // Admin-only routes (the common pool) are dropped from the catalog for a
  // tenant that is not Vikuna's own. In mock mode there is no session, so
  // everything shows — the mock is for looking at screens.
  const isAdmin = !IS_LIVE || tenant?.is_admin === true;
  const skills = useMemo(
    () => (isAdmin ? GTM_SKILLS : GTM_SKILLS.map((sk) => ({ ...sk, routes: sk.routes.filter((r) => !r.adminOnly) }))),
    [isAdmin],
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
          skills={skills}
          org={tenant?.name || 'Vikuna Technologies'}
          slug={tenant?.slug || 'vikuna'}
          onSignOut={handleSignOut}
        >
          <div className={s.top}>
            <Link href="/dashboard" className={s.back}>← Back to VaNi</Link>
            <div className={s.crumbs}>
              <span>GTM</span>
              <span>·</span>
              <span className={s.crumbCurr}>Growth workspace</span>
            </div>
            <PreviewBadge />
          </div>
          {children}
        </Shell>
      </RequireSession>
    </QueryClientProvider>
  );
}
