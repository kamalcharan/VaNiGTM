'use client';

/**
 * App layout — wraps authenticated routes (onboarding, dashboard, settings).
 * Provides a minimal container; individual pages handle their own chrome.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
