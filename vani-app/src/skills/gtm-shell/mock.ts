/**
 * GTM's mock handlers, spread into lib/mock-transport by one import. The
 * shapes here are the CONTRACT the backend meets at integration — see
 * INTEGRATION.md in each GTM skill folder for the function each maps to.
 *
 * Synthetic tenant throughout: Ledgerline (contract software for hospitals).
 * Nothing here is from a real crawl or a real run.
 */
import type { JourneyProgress } from '@/platform/registry';
import { AUDIENCE_MOCK_READS, AUDIENCE_MOCK_WRITES } from '@/skills/gtm-audience/mock';

/* ── readiness: what GTM read from the Smart Profile ─────────────────── */

export type ReadinessState = 'captured' | 'missing';

export interface ReadinessObject {
  key: 'product' | 'buyer' | 'vocabulary' | 'brand' | 'offers' | 'competitors';
  label: string;
  state: ReadinessState;
  /** What was captured, in one line. Empty when missing — never a placeholder. */
  value: string | null;
  /** Why GTM needs it — in the tenant's terms. */
  why: string;
  /** The Smart Profile step that owns it. */
  href: string;
}

export interface Readiness {
  score: number;
  ready: boolean;
  /** The single thing that most blocks GTM, if any. */
  weakest: ReadinessObject['key'] | null;
  objects: ReadinessObject[];
  changes: { at: string; text: string }[];
}

/** Flip to false to see the other lane (no offer) in mock mode. */
export const MOCK_HAS_OFFER = true;

export function mockReadiness(): Readiness {
  const objects: ReadinessObject[] = [
    { key: 'product', label: 'Product', state: 'captured', href: '/onboarding?step=company',
      value: 'Ledgerline — contract lifecycle software for hospitals: renewals, vendor SLAs, AMC tracking.',
      why: 'What everything else is built on.' },
    { key: 'buyer', label: 'Buyer', state: 'captured', href: '/onboarding?step=icp',
      value: 'Head of Procurement / Contracts, 200–800 bed hospitals · renewals missed · SLAs unenforced',
      why: 'Frames every cohort GTM proposes.' },
    { key: 'vocabulary', label: 'Vocabulary', state: 'captured', href: '/onboarding?step=vocabulary',
      value: 'contract lifecycle · vendor compliance · renewal leakage · AMC / SLA tracking',
      why: 'Every search and every hot list is framed in these terms.' },
    { key: 'brand', label: 'Brand', state: 'captured', href: '/onboarding?step=brand',
      value: 'plain · evidence-first · never "revolutionary"',
      why: 'A story without a voice is a template.' },
    { key: 'offers', label: 'Offers', state: MOCK_HAS_OFFER ? 'captured' : 'missing', href: '/onboarding?step=offers',
      value: MOCK_HAS_OFFER ? 'Contract audit (entry) · Ledgerline platform (project)' : null,
      why: 'Fit is scored against an offer. With none, there is nothing to score.' },
    { key: 'competitors', label: 'Competitors', state: 'captured', href: '/onboarding?step=competitors',
      value: 'none named — positions on category',
      why: 'Sharpens what research looks for. "None" is a valid answer.' },
  ];
  const missing = objects.filter((o) => o.state === 'missing');
  return {
    score: MOCK_HAS_OFFER ? 64 : 48,
    ready: missing.length === 0,
    weakest: missing[0]?.key ?? null,
    objects,
    changes: MOCK_HAS_OFFER
      ? [
          { at: 'yesterday', text: 'Your profile crossed the line — 64/100. GTM can work from it now.' },
          { at: '2 days ago', text: 'Read your pricing page: 2 offers drafted, both confirmed by you.' },
          { at: '4 days ago', text: 'Vocabulary ratified: 4 clusters, 41 terms.' },
        ]
      : [{ at: '4 days ago', text: 'Vocabulary ratified: 4 clusters, 41 terms.' }],
  };
}

/* ── journeys ─────────────────────────────────────────────────────────── */

/** Mutated by the audience mock as the tenant walks G1, so the landing and
 *  the dashboard card move without a reload. */
export const GTM_JOURNEY_STATE = { audience: false, people: false, motion: false };

export function mockGtmJourney(): JourneyProgress {
  const done: string[] = [];
  const r = mockReadiness();
  if (r.ready) done.push('profile');
  if (GTM_JOURNEY_STATE.audience) done.push('audience');
  if (GTM_JOURNEY_STATE.people) done.push('people');
  if (GTM_JOURNEY_STATE.motion) done.push('motion');
  const note = !r.ready ? 'waiting on an offer'
    : GTM_JOURNEY_STATE.people ? `people found — nothing in motion yet`
    : GTM_JOURNEY_STATE.audience ? 'audience built — find the people'
    : 'not started — build the audience';
  return { done, note };
}

export function mockVaraJourney(): JourneyProgress {
  // Mirrors the Vara mock's own state loosely: domain declared, families
  // taken, one JD published. The live answer comes from vara state.
  return { done: ['domain', 'families', 'jd'], note: 'screening 1 role — the second JD is nearly free' };
}

export const GTM_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  ...AUDIENCE_MOCK_READS,
  'gtm.readiness': () => mockReadiness(),
  'gtm.journey': () => mockGtmJourney(),
  'vara.journey': () => mockVaraJourney(),
};

export const GTM_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  ...AUDIENCE_MOCK_WRITES,
};
