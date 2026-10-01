'use client';
/**
 * The public page's client plumbing: a query client for the funnel's poll and
 * the skill transport (live against api.vikuna.io, or the mock without
 * NEXT_PUBLIC_API_ORIGIN). No session is required or checked here.
 */
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { installSkillTransport } from '@/lib/transport';
import { SiteState } from './SiteState';

installSkillTransport();

export function SiteProviders({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  return (
    <QueryClientProvider client={qc}>
      <SiteState>{children}</SiteState>
    </QueryClientProvider>
  );
}
