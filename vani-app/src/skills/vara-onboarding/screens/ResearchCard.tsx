'use client';

/**
 * "Vara hasn't learned your industry yet" — and what to do about it.
 *
 * Replaces a static italic line that told every tenant with no playbooks the
 * same thing, whatever the actual reason was. There are five, they need
 * different actions, and one of them (a failed run) is recoverable by pressing
 * a button:
 *
 *   no_industry  set an industry — nothing can be researched without one
 *   none         never attempted — offer to start it
 *   running      in flight — say so, and poll
 *   in_review    drafted, waiting on Vikuna — nothing for the tenant to do
 *   failed       show the REAL cause and offer a retry
 *
 * Rule 12: the retry is an explicit user-chosen path offered after a visible
 * failure with the real diagnosis. Never an automatic fallback, and the screen
 * never substitutes generic role families for real ones — a tenant must be
 * able to tell "Vara knows my industry" from "Vara is guessing".
 *
 * Rule 9b: every state here carries a next action, including the ones where
 * that action is "carry on, this is not blocking you".
 */

import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import { InlineLoader } from '@/platform/feedback';
import s from '../vara-onboarding.module.css';

const SKILL = 'domain-pack-skill';

type ResearchState =
  | 'no_industry' | 'ready' | 'seeded_only'
  | 'running' | 'in_review' | 'failed' | 'none';

interface ResearchStatus {
  state: ResearchState;
  industry: string | null;
  domain: string | null;
  families: number;
  /** Where the families came from. 'seeded' = migration 244's generic packs. */
  source: 'seeded' | 'researched' | 'mixed';
  researched_at: string | null;
  can_request: boolean;
  detail: string;
}

/**
 * `variant` decides what this renders, because the same status answers two
 * different questions on the same screen:
 *
 *   'provenance' — in "What Vara already knows about you". Always present.
 *                  Says where the role families came from, which the doorway
 *                  never did: three seeded packs read exactly like three
 *                  researched ones.
 *   'action'     — under the family picker. Only when something is wrong or
 *                  missing, so a settled screen stays quiet.
 */
export function ResearchCard(
  { industryRaw, variant = 'action' }:
  { industryRaw: string; variant?: 'provenance' | 'action' },
) {
  const q = useSkillQuery<ResearchStatus>(SKILL, 'research_status', {}, {
    // Poll only while something is actually happening. A fixed interval would
    // keep hitting the API for every tenant sitting on this screen.
    refetchInterval: (query) => {
      const st = query.state.data?.data?.state;
      return st === 'running' || st === 'in_review' ? 5000 : false;
    },
  });

  const request = useSkillMutation(SKILL, 'request_research', {
    successMessage: 'Vara is studying your industry — this page updates when it finishes.',
    errorMessage: 'Could not start the research.',
    onSuccess: () => { void q.refetch(); },
  });

  // A refusal arrives as success:false with HTTP 200, so the query can succeed
  // and still carry no data. Treat that as "no information", not as an error
  // screen — the family list below still works and the tenant is not blocked.
  const status = q.data?.success ? q.data.data : null;
  if (q.isLoading) return <InlineLoader size="sm" />;
  if (!status) return null;

  if (variant === 'provenance') return <Provenance status={status} industryRaw={industryRaw} />;

  // The action variant stays silent once the industry has really been
  // researched — a settled screen should not carry a banner.
  if (status.state === 'ready') return null;

  const tone =
    status.state === 'failed' ? s.researchFailed
    : status.state === 'running' || status.state === 'in_review' ? s.researchBusy
    : s.researchIdle;

  return (
    <div className={`${s.research} ${tone}`}>
      <div className={s.researchBody}>
        <b>
          {status.state === 'no_industry'
            ? 'Vara needs your industry first'
            : status.state === 'running'
            ? `Learning how ${status.industry ?? industryRaw} hires…`
            : status.state === 'in_review'
            ? 'Role families drafted — in review'
            : status.state === 'failed'
            ? 'The last attempt did not finish'
            : status.state === 'seeded_only'
            ? `These are starter playbooks, not ${status.industry ?? industryRaw} research`
            : `No playbooks for ${status.industry ?? industryRaw} yet`}
        </b>
        {/* The server's own words. A failed run names the real cause here —
            a tenant who reads "the model was unreachable" knows a retry is
            worth pressing; one who reads "something went wrong" does not. */}
        <span className={s.researchDetail}>{status.detail}</span>
        <span className={s.researchNote}>
          {status.state === 'seeded_only'
            ? 'Use them as a starting shape, or have Vara study how your industry actually hires.'
            : 'You are not blocked — pick Other below and write the role yourself. '
              + 'Recommendations appear here when Vara has them.'}
        </span>
      </div>

      {status.can_request && (
        <button
          type="button"
          className={s.primary}
          disabled={request.isPending}
          onClick={() => void request.mutate({})}
        >
          {request.isPending
            ? 'Starting…'
            : status.state === 'failed' ? 'Try again' : 'Research my industry'}
        </button>
      )}
    </div>
  );
}


/**
 * One line in "What Vara already knows about you", beside the Smart Profile
 * fields — because "Vara has starting playbooks for these" was true of both a
 * pack somebody researched and a pack Vikuna handwrote in August, and the
 * screen said the same thing either way (rule 9d: never present the
 * unverified as derived).
 */
function Provenance(
  { status, industryRaw }: { status: ResearchStatus; industryRaw: string },
) {
  const industry = status.industry ?? industryRaw;

  const text =
    status.state === 'no_industry'
      ? 'No industry set, so Vara has no role families to work from.'
      : status.families === 0
      ? `No role families for ${industry} yet.`
      : status.source === 'researched'
      ? `${status.families} role families, researched for ${industry}`
        + (status.researched_at ? ` on ${formatDay(status.researched_at)}.` : '.')
      : status.source === 'mixed'
      ? `${status.families} role families for ${industry} — some researched, some from `
        + "Vikuna's starter set."
      : `${status.families} role families — Vikuna's generic starter set, `
        + `not researched for ${industry}.`;

  return (
    <div className={s.provenance}>
      <span className={s.provenanceLabel}>Role playbooks</span>
      <span>{text}</span>
    </div>
  );
}

/** DD-MMM-YYYY, the format both consoles use. */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}
