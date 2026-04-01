'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { VdfSidebar } from '@/components/vdf';
import { getAccessToken } from '@/lib/api-client';
import s from './app-shell.module.css';

/** Routes that render full-screen without the sidebar */
const FULL_SCREEN_ROUTES = ['/onboarding'];

/**
 * Authenticated app shell — VdfSidebar + content area.
 * Guards:
 *   - No token → redirect to /login
 *   - Onboarding incomplete → redirect to /onboarding
 *   - Onboarding route → render full-screen (no sidebar)
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tenant, isLoading } = useAuth();

  const isFullScreen = FULL_SCREEN_ROUTES.some((r) => pathname.startsWith(r));
  const isOnboarding = pathname.startsWith('/onboarding');

  // Auth guard: no token → login
  useEffect(() => {
    if (typeof window !== 'undefined' && !getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  // Onboarding guard: incomplete → redirect to onboarding (unless already there)
  useEffect(() => {
    if (!isLoading && tenant && !tenant.onboarding_complete && !isOnboarding) {
      router.replace('/onboarding');
    }
  }, [isLoading, tenant, isOnboarding, router]);

  if (isFullScreen) return <>{children}</>;

  return (
    <div className={s.shell}>
      <VdfSidebar />
      <main className={s.main}>
        {children}
      </main>
    </div>
  );
}
