'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { VdfSidebar, VdfLoader } from '@/components/vdf';
import { VdfMobileHeader } from '@/components/vdf/mobile-header/VdfMobileHeader';
import { VdfBottomNav } from '@/components/vdf/bottom-nav/VdfBottomNav';
import { getAccessToken } from '@/lib/api-client';
import s from './app-shell.module.css';

/** Routes that render full-screen without the sidebar */
const FULL_SCREEN_ROUTES = ['/onboarding'];

/**
 * Authenticated app shell — VdfSidebar + content area.
 *
 * Mobile layout (≤768px):
 *   - VdfMobileHeader: sticky 56px top bar with hamburger + page title + env pill
 *   - VdfSidebar: position:fixed overlay, toggled via sidebarOpen state
 *   - VdfBottomNav: fixed 60px bottom tab bar with 5 key destinations
 *
 * Desktop layout (>768px):
 *   - VdfSidebar: sticky left rail (hover to expand)
 *   - MobileHeader + BottomNav are display:none via CSS
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [clientReady,  setClientReady]  = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const pathname = usePathname();
  const router   = useRouter();
  const { tenant, isLoading, isAuthenticated } = useAuth();

  const isFullScreen  = FULL_SCREEN_ROUTES.some((r) => pathname?.startsWith(r) ?? false);
  const isOnboarding  = pathname?.startsWith('/onboarding') ?? false;

  // Hydration safety: both server and initial client render agree on false
  useEffect(() => { setClientReady(true); }, []);

  // Auth guard
  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  // Onboarding guard
  useEffect(() => {
    if (isLoading || !tenant) return;
    if (!tenant.onboarding_complete && !isOnboarding) {
      router.replace('/onboarding');
    } else if (tenant.onboarding_complete && isOnboarding) {
      // onboarding_complete just became true — push to dashboard
      router.replace('/dashboard');
    }
  }, [isLoading, tenant, isOnboarding, router]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!clientReady) return null;
  if (isLoading) return <VdfLoader overlay message="Loading" />;
  if (!isAuthenticated && !getAccessToken()) return null;
  if (isFullScreen) return <>{children}</>;

  return (
    <div className={s.shell}>
      {/* Mobile-only top bar — hidden on desktop via CSS */}
      <VdfMobileHeader onMenuOpen={() => setSidebarOpen(true)} />

      {/* Sidebar — hover expand on desktop, prop-driven on mobile */}
      <VdfSidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <main className={s.main}>
        {children}
      </main>

      {/* Mobile-only bottom tab bar — hidden on desktop via CSS */}
      <VdfBottomNav onMorePress={() => setSidebarOpen(true)} />
    </div>
  );
}
