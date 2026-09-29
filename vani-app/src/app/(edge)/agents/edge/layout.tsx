/**
 * Edge workspace layout — every route under /agents/edge/* wears EdgeShell:
 * Edge's own chrome over the console's platform layer, the same trick as
 * (vara)/agents/vara and (gtm)/agents/gtm. The URL is what the chapter
 * sidebar keys on.
 */
import EdgeShell from '@/skills/edge/EdgeShell';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return <EdgeShell>{children}</EdgeShell>;
}
