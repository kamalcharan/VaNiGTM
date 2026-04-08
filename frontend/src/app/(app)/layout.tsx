'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { VdfSidebar, VdfLoader } from '@/components/vdf';
import { getAccessToken } from '@/lib/api-client';
import s from './app-shell.module.css';

/** Routes that render full-screen without the sidebar */
const FULL_SCREEN_ROUTES = ['/onboarding'];

/**
 * Authenticated app shell — VdfSidebar + content area.
 *
 * Hydration safety: `clientReady` starts false on both server and initial
 * client render, so they agree and there is no hydration mismatch.
 * After useEffect (post-hydration) we switch to the auth-aware state.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [clientReady, setClientReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { tenant, isLoading, isAuthenticated } = useAuth();

  const isFullScreen = FULL_SCREEN_ROUTES.some((r) => pathname.startsWith(r));
  const isOnboarding = pathname.startsWith('/onboarding');

  // Mark client as ready after first paint — this fires synchronously after hydration
  useEffect(() => { setClientReady(true); }, []);

  // Auth guard: no token → login
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  // Onboarding guard: incomplete → redirect to onboarding (unless already there)
  useEffect(() => {
    if (!isLoading && tenant && !tenant.onboarding_complete && !isOnboarding) {
      router.replace('/onboarding');
    }
  }, [isLoading, tenant, isOnboarding, router]);

  // Pre-hydration: both server and initial client render nothing.
  // This prevents a structural mismatch (server=shell, client=VdfLoader).
  if (!clientReady) return null;

  // Post-hydration: auth-aware rendering
  if (isLoading) return <VdfLoader overlay message="Loading" />;

  // No token — render nothing while redirect fires
  if (!isAuthenticated && !getAccessToken()) return null;

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
