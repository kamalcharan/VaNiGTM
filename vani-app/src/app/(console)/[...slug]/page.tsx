'use client';

/**
 * Catch-all for registered-but-unbuilt destinations.
 *
 * Next resolves specific routes first, so a live screen with its own page.tsx
 * always wins. This means a *planned* route needs no file at all — declaring it
 * in a skill module is enough for it to appear in the nav and explain itself.
 */
import { usePathname } from 'next/navigation';
import { notFound } from 'next/navigation';
import { findRoute } from '@/platform/registry';
import { SKILLS } from '@/skills';
import { NotYet } from '@/platform/shell/NotYet';

export default function PlannedRoutePage() {
  const pathname = usePathname() ?? '';
  const route = findRoute(SKILLS, pathname);
  if (!route) notFound();
  return <NotYet route={route} />;
}
