/**
 * GTM workspace layout — every route under /agents/gtm/* wears GtmShell
 * (GTM-only sidebar, back button) instead of the console shell. Same trick as
 * (vara)/agents/vara; the URL is what the sidebar keys on.
 */
import GtmShell from '@/skills/gtm-shell/GtmShell';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return <GtmShell>{children}</GtmShell>;
}
