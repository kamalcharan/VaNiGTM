'use client';

/**
 * G1 · Build the audience — the pathway shell around four existing pages.
 *
 * The four surfaces here already existed and are UNCHANGED. What is new is
 * that they have an order, a progress indicator and a next step:
 *
 *   1 Find        /gtm/audience/find      (was /research)
 *   2 Qualify     /gtm/audience/qualify   (was /prospects)
 *   3 Find people /gtm/audience/people    (was /console — VaNi Leads)
 *   4 Enrich      /gtm/audience/enrich    (the contact import view)
 *
 * ── WHY A LAYOUT, AND WHY REAL SUB-ROUTES ──────────────────────────────────
 *
 * A layout wraps children without touching them, which is exactly the brief's
 * constraint: the pages render inside the shell instead of standing alone.
 *
 * The steps are real routes rather than internal state because breadcrumbs
 * must be computable from the URL alone — `GTM › Build the audience › Qualify`
 * only works if "qualify" is IN the URL. It also means every step is
 * linkable, refreshable and back-buttonable, which internal step state is not.
 *
 * ── THE LEFT RAIL ──────────────────────────────────────────────────────────
 *
 * Shows what each completed step produced. Counts are enough for now, per the
 * brief. They are fetched here rather than lifted from the pages because a
 * layout cannot see its children's state — and a count that is briefly stale
 * is better than threading a store through four pages that were supposed to
 * stay untouched.
 */

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { VdfPathwayShell, VdfMissionMemory, type VdfMissionMemoryItem } from '@/components/vdf';
import { useSkillQuery } from '@/hooks';

const STEPS = [
  { id: 'find',    label: 'Find',        href: '/gtm/audience/find' },
  { id: 'qualify', label: 'Qualify',     href: '/gtm/audience/qualify' },
  { id: 'people',  label: 'Find people', href: '/gtm/audience/people' },
  { id: 'enrich',  label: 'Enrich',      href: '/gtm/audience/enrich' },
] as const;

/** Count rows out of whatever shape a skill returned, without caring which. */
function countOf(result: unknown): number | null {
  const data = (result as { data?: Record<string, unknown> } | undefined)?.data;
  if (!data) return null;
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'number') return value;
  }
  return null;
}

export default function AudiencePathwayLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const stepIndex = Math.max(
    0,
    STEPS.findIndex((st) => pathname === st.href || pathname?.startsWith(`${st.href}/`)),
  );

  // Best-effort, never blocking: a rail that cannot load its counts still
  // shows the pathway's shape, which is most of its value.
  const prospects = useSkillQuery('prospect-skill', 'get_records', {}, { retry: false });
  const leads     = useSkillQuery('assessment-skill', 'get_leads', {}, { retry: false });
  const contacts  = useSkillQuery('contact-skill', 'get_contacts', {}, { retry: false });

  const railItems: VdfMissionMemoryItem[] = useMemo(() => {
    const counts: (number | null)[] = [
      countOf(prospects.data),          // companies found
      countOf(prospects.data),          // qualified — same source until the
                                        // qualify filter is a real query
      countOf(leads.data),
      countOf(contacts.data),
    ];
    const nouns = ['companies found', 'qualified', 'people found', 'contacts enriched'];

    return STEPS.map((step, i) => ({
      id: step.id,
      step: i + 1,
      title: step.label,
      state: i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending',
      artifact: counts[i] != null
        ? <span>{counts[i]} {nouns[i]}</span>
        : undefined,
      expectsArtifact: true,
    }));
  }, [prospects.data, leads.data, contacts.data, stepIndex]);

  return (
    <VdfPathwayShell
      eyebrow="GTM · Aria"
      name="Build the audience"
      steps={STEPS.map(({ id, label }) => ({ id, label }))}
      currentIndex={stepIndex}
      completedSteps={new Set(STEPS.slice(0, stepIndex).map((st) => st.id))}
      onStepClick={(i) => router.push(STEPS[i].href)}
      artefacts={<VdfMissionMemory items={railItems} />}
    >
      {children}
    </VdfPathwayShell>
  );
}
