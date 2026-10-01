'use client';
/**
 * Catch-all for GTM routes declared but not built. A live screen with its own
 * page.tsx wins; a planned one needs only its catalog line to appear in the
 * sidebar and explain itself.
 */
import { notFound, usePathname } from 'next/navigation';
import { findRoute } from '@/platform/registry';
import { GTM_SKILLS } from '@/skills/gtm-shell/gtm-nav';
import { NotYet } from '@/platform/shell/NotYet';

export default function PlannedGtmRoute() {
  const pathname = usePathname() ?? '';
  const route = findRoute(GTM_SKILLS, pathname);
  if (!route) notFound();
  return <NotYet route={route} />;
}
