/**
 * Vara workspace layout — Charan's Option B, 2026-08-17.
 *
 * Any route under /agents/vara/* rendered by files in this route group is
 * wrapped by VaraShell — Vara-only sidebar, persona switcher, back button —
 * INSTEAD of the general console shell. This is what makes Vara feel like
 * its own workspace without a new tab or a separate login.
 *
 * Files at (console)/agents/vara/* were moved to (vara)/agents/vara/* to
 * take Vara out of the console layout entirely; the URL is unchanged, so
 * every existing link works.
 */

import VaraShell from '@/platform/shell/VaraShell';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return <VaraShell>{children}</VaraShell>;
}
