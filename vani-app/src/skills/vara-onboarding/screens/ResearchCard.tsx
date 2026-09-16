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
  | 'no_industry' | 'ready' | 'running' | 'in_review' | 'failed' | 'none';

interface ResearchStatus {
  state: ResearchState;
  industry: string | null;
  domain: string | null;
  families: number;
  can_request: boolean;
  detail: string;
}

export function ResearchCard({ industryRaw }: { industryRaw: string }) {
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
  if (!status || status.state === 'ready') return null;

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
            : `No playbooks for ${status.industry ?? industryRaw} yet`}
        </b>
        {/* The server's own words. A failed run names the real cause here —
            a tenant who reads "the model was unreachable" knows a retry is
            worth pressing; one who reads "something went wrong" does not. */}
        <span className={s.researchDetail}>{status.detail}</span>
        <span className={s.researchNote}>
          You are not blocked — pick <b>Other</b> below and write the role yourself.
          Recommendations appear here when Vara has them.
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
