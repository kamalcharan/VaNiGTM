'use client';

import { usePathname } from 'next/navigation';
import { VdfSidebar } from '@/components/vdf';
import s from './app-shell.module.css';

/** Routes that render full-screen without the sidebar */
const FULL_SCREEN_ROUTES = ['/onboarding'];

/**
 * Authenticated app shell — VdfSidebar + content area.
 * Wraps all (app) routes: dashboard, settings, clients, portfolio, etc.
 * Onboarding renders full-screen without sidebar.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullScreen = FULL_SCREEN_ROUTES.some((r) => pathname.startsWith(r));

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
