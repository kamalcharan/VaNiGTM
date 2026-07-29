'use client';

/**
 * What the agents are doing and what it is costing — in the nav, on every page.
 *
 * ── WHY IT LIVES HERE AND NOT ON THE RESEARCH SCREEN ──────────────────
 *
 * A research batch takes hours. Nobody sits on the Research page watching it,
 * and they should not have to: the whole point of the worker being a separate
 * process is that you can go and do something else. But that means the two
 * facts you need — is it still running, and what has today cost — were
 * visible only on the one screen you had walked away from.
 *
 * The token line is deliberately shown even when there is no cap (which is the
 * default since migration 217). It is not a warning, it is a meter: a hundred
 * companies is a real number of tokens, and knowing that number is how anyone
 * decides whether to set a cap at all.
 *
 * ── QUIET BY DEFAULT ──────────────────────────────────────────────────
 *
 * Renders nothing at all when nothing is running and nothing has been spent
 * today. A permanent zero in the nav is furniture, and furniture stops being
 * read — which would defeat the point on the day it matters.
 */

import { useSkillQuery } from '@/hooks/useSkill';
import s from './VdfAgentActivity.module.css';

interface BatchStatus {
  verdict: 'never_run' | 'queued' | 'running' | 'worker_down' | 'failed' | 'completed' | 'unknown';
  message: string;
  healthy: boolean;
  done_count: number;
  requested: number | null;
  stopped_for_budget: boolean;
}

interface Budget {
  limit: number | null;
  used: number | null;
  capped: boolean;
  tracked: boolean;
  cost_per_company: number;
  affordable_companies: number | null;
}

/** 102904 → "103k". Precision nobody needs is precision nobody reads. */
const short = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${Math.round(n / 1_000)}k`
      : String(n);

export interface VdfAgentActivityProps {
  /** Collapsed rail: dot only, with the detail in the tooltip. */
  compact?: boolean;
  onOpenResearch?: () => void;
}

export function VdfAgentActivity({ compact = false, onOpenResearch }: VdfAgentActivityProps) {
  // 15s, not the Research page's 5s. Someone watching a batch is on that
  // screen; this is for someone who walked away, and a slower poll app-wide
  // is the difference between an indicator and a background job of its own.
  const statusQ = useSkillQuery<BatchStatus>(
    'research-skill', 'batch_status', {}, { refetchInterval: 15000 },
  );
  const budgetQ = useSkillQuery<Budget>(
    'research-skill', 'get_budget', {}, { refetchInterval: 60000 },
  );

  const batch = statusQ.data?.data;
  const budget = budgetQ.data?.data;
  const used = budget?.used ?? 0;

  const running = batch?.verdict === 'running' || batch?.verdict === 'queued';
  const stuck = batch?.verdict === 'worker_down';
  const stopped = batch?.stopped_for_budget === true;
  const failed = batch?.verdict === 'failed';

  // Nothing happening and nothing spent: say nothing.
  if (!running && !stuck && !stopped && !failed && used === 0) return null;

  const progress = batch?.requested
    ? `${batch.done_count}/${batch.requested}`
    : `${batch?.done_count ?? 0}`;

  const state = stuck ? 'Nothing is picking up the queue — is the worker running?'
    : failed ? 'The last batch failed'
      : stopped ? 'Last batch stopped early — token cap reached'
        : running ? `Researching ${progress}`
          : null;

  const tokenLine = budget?.tracked
    ? `${short(used)} tokens today${budget.capped ? ` of ${short(budget.limit ?? 0)}` : ''}`
    : null;

  const tone = stuck || failed ? s.bad : stopped ? s.warn : running ? s.busy : s.idle;

  return (
    <button
      type="button"
      className={`${s.wrap} ${tone} ${compact ? s.compact : ''}`}
      onClick={onOpenResearch}
      title={[state, tokenLine,
        budget?.capped && budget.affordable_companies !== null
          ? `about ${budget.affordable_companies} more companies fit today`
          : budget?.tracked ? 'no cap on this tenant' : null,
      ].filter(Boolean).join(' · ')}
    >
      <span className={`${s.dot} ${running ? s.dotPulse : ''}`} />
      {!compact && (
        <span className={s.body}>
          {state && <span className={s.state}>{state}</span>}
          {tokenLine && <span className={s.tokens}>{tokenLine}</span>}
        </span>
      )}
    </button>
  );
}
