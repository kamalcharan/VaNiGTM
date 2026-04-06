'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { VdfSidebar, VdfLoader } from '@/components/vdf';
import { getAccessToken } from '@/lib/api-client';
import s from './app-shell.module.css';

/** Routes that render full-screen without the sidebar */
const FULL_SCREEN_ROUTES = ['/onboarding'];

/**
 * Authenticated app shell — VdfSidebar + content area.
 * Guards:
 *   - No token          → redirect to /login
 *   - Auth loading      → full-screen spinner (no flash of protected content)
 *   - Onboarding incomplete → redirect to /onboarding
 *   - Onboarding route  → render full-screen (no sidebar)
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tenant, isLoading, isAuthenticated } = useAuth();

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

  // While auth state resolves, show a full-screen loader to prevent
  // flashing protected content before the redirect fires.
  if (isLoading) {
    return <VdfLoader overlay message="Loading" />;
  }

  // No token at all — render nothing while redirect fires
  if (!isAuthenticated && typeof window !== 'undefined' && !getAccessToken()) {
    return null;
  }

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
