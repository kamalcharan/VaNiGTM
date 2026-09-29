/**
 * UX PREVIEW — functions the console can call that the API cannot answer yet.
 *
 * The GTM screens were built UX-first (docs/gtm-ux-poa.md): every screen calls
 * a skill function whose SHAPE is decided by the fixture and whose backend is
 * integrated later. Development happens against the deployed stack
 * (CLAUDE.md §0), where the live transport would send those calls to the skill
 * runner and get "No handler registered". So the calls listed here are
 * answered from the fixtures instead — on the live transport too.
 *
 * This is NOT a silent fallback (VaNiGTM rule 12). It is a declared, countable
 * list; every answer it gives is stamped `preview: true`; and the shell shows
 * a PREVIEW badge whenever a screen is on it. A function leaves this list the
 * day its backend lands, and from then on a missing handler fails loudly
 * again. Do not add a function here to hide a backend gap — add it because
 * the screen exists before the backend does, and say so in INTEGRATION.md.
 */
import { GTM_MOCK_READS, GTM_MOCK_WRITES } from '@/skills/gtm-shell/mock';
import { CONSOLE_PREVIEW_READS } from './mock-transport';
import { EDGE_MOCK_READS } from '@/skills/edge/mock';

type Handler = (p: Record<string, unknown>) => unknown;

/**
 * Functions that EXIST on the API and must never be shadowed by a fixture —
 * on the live transport the real answer is the only honest one. People,
 * Companies, the import and the whole of G1's research and people are real
 * (2026-09-25); what G1 still previews is its POSITION (gtm.audience_state).
 */
const REAL = new Set([
  'contact-skill.get_contacts', 'contact-skill.get_contact',
  'contact-skill.list_brief_contacts', 'contact-skill.promote_from_brief',
  'prospect-skill.get_records', 'prospect-skill.get_prospect',
  'research-skill.start_research', 'research-skill.batch_status', 'research-skill.get_briefs', 'research-skill.decide_brief',
  'research-skill.get_budget', 'research-skill.get_offers',
  'prospect-skill.get_loads',
  'etl.upload', 'etl.headers', 'etl.create_session', 'etl.process', 'etl.sessions', 'etl.records', 'etl.resolve_conflicts',
  'etl.status', 'etl.tags', 'etl.create_tag', 'etl.reprocess', 'etl.patch_record', 'etl.sync_stats', 'etl.delete_staging',
]);

export const PREVIEW_FUNCTIONS: Record<string, Handler> = Object.fromEntries(
  Object.entries({ ...CONSOLE_PREVIEW_READS, ...GTM_MOCK_READS, ...GTM_MOCK_WRITES, ...EDGE_MOCK_READS }).filter(([k]) => !REAL.has(k)),
);

export const isPreviewFunction = (skill: string, fn: string): boolean => `${skill}.${fn}` in PREVIEW_FUNCTIONS;

/** Skills with at least one previewed function — for the badge. */
export const PREVIEW_SKILLS = new Set(Object.keys(PREVIEW_FUNCTIONS).map((k) => k.split('.')[0]));
