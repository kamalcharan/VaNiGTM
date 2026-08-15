/**
 * attention-skill: get_attention
 *
 * The queue behind /today: accounts that have gone quiet, ranked, plus the
 * counts the screen needs to explain itself when the queue is empty.
 *
 * The ranking is not in here. It is in backend/src/config/attention.config.ts
 * and reaches the database as bound parameters, so tuning is a one-file diff
 * and the numbers that produced any given ordering are recoverable.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SkillContext } from '../../../types/skill.types';
import {
  ATTENTION_CONFIG,
  IN_PLAY_STATES,
  type AttentionReason,
} from '../../../config/attention.config';

const Q = (name: string) =>
  fs.readFileSync(path.join(__dirname, '../queries', name), 'utf-8');

// _candidates.sql is a prefix, not a query. See its header for why the
// candidate logic is defined once and shared by both tails.
const CANDIDATES   = Q('_candidates.sql');
const GET_PAGE_SQL = CANDIDATES + '\n' + Q('get-attention.sql');
const GET_CTX_SQL  = CANDIDATES + '\n' + Q('get-attention-context.sql');

export interface AttentionItem {
  journey_id: string;
  prospect_id: string;
  company: string;
  ref: string | null;
  city: string | null;
  journey_state: string;
  offer: string | null;
  contact_id: string | null;
  reason: AttentionReason;
  days_quiet: number;
  /** The touch `reason: 'follow_up_due' | 'gone_quiet'` is silent about —
   *  what a "they replied" action (set_touch_outcome) attaches its outcome
   *  to. Null when there has never been a touch to attach one to. */
  last_touch_id: string | null;
  last_touch_at: string | null;
  last_outcome: string | null;
  last_channel: string | null;
  wake_at: string | null;
  score: number;
  standing_decision: string | null;
  snooze_until: string | null;
  decided_at: string | null;
  is_handled: boolean;
  is_snoozed: boolean;
  is_dismissed: boolean;
}

interface AttentionContext {
  prospects_total: number;
  journeys_in_play: number;
  matched: number;
  suppressed_handled: number;
  suppressed_snoozed: number;
  suppressed_dismissed: number;
  surfaced: number;
  next_snooze_due: string | null;
  in_play_never_touched: number;
  /** Touched, waiting on a reply, not yet due for a follow-up nudge — never
   *  in `items`, only counted here. Close the loop item 2/3. */
  awaiting_reply: number;
  /** Subset of `surfaced` already counted there — accounts on the list
   *  because they replied. Broken out so the screen can say the loop
   *  closed, not just that the account is still on the list. */
  replied_awaiting_response: number;
}

/**
 * Which of the four empty states the screen is in — decided here, once, so
 * the frontend renders a verdict instead of re-deriving one from six counts
 * and getting a different answer.
 *
 *   'has_items'    there is work; render the list
 *   'no_accounts'  nothing imported. The next step is import, not follow-up
 *   'none_in_play' companies exist, none qualified. That is the research
 *                  queue's job, and saying "all caught up" here would be a
 *                  lie about a pipeline that was never filled
 *   'all_current'  in play, nothing past the window. Genuinely up to date
 *   'all_handled'  there WAS work and it has been disposed of today
 */
export type AttentionEmptyState =
  | 'has_items'
  | 'no_accounts'
  | 'none_in_play'
  | 'all_current'
  | 'all_handled';

function emptyState(ctx: AttentionContext, itemCount: number): AttentionEmptyState {
  if (itemCount > 0) return 'has_items';
  if (ctx.prospects_total === 0) return 'no_accounts';
  if (ctx.journeys_in_play === 0) return 'none_in_play';
  // Order matters: something was surfaceable and is now suppressed, which is
  // a different day from one where nothing ever crossed the threshold.
  if (ctx.suppressed_handled + ctx.suppressed_snoozed + ctx.suppressed_dismissed > 0) {
    return 'all_handled';
  }
  return 'all_current';
}

interface GetAttentionParams {
  limit?: number;
  offset?: number;
  include_dismissed?: boolean;
}

export async function get_attention(params: GetAttentionParams, ctx: SkillContext) {
  const cfg = ATTENTION_CONFIG;

  const requested = Number(params.limit);
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), cfg.max_page_size)
    : cfg.page_size;

  const offsetIn = Number(params.offset);
  const offset = Number.isFinite(offsetIn) && offsetIn > 0 ? Math.floor(offsetIn) : 0;

  const bound = {
    $tenant_id:            ctx.tenant_id,
    $is_live:              ctx.is_live,
    $in_play_states:       [...IN_PLAY_STATES],
    $quiet_after_days:     cfg.quiet_after_days,
    $follow_up_after_days: cfg.follow_up_after_days,
    $max_days_counted:     cfg.max_days_counted,
    $per_day_weight:       cfg.per_day_weight,
    $reason_weights:       JSON.stringify(cfg.reason_weight),
    $limit:                limit,
    $offset:               offset,
    $include_dismissed:    params.include_dismissed === true,
  };

  // Two round trips rather than one query returning both shapes. The counts
  // are aggregates over the whole candidate set and the page is a slice of
  // it; folding them together means either a window function on every row or
  // a count that pagination silently changes.
  const [page, context] = await Promise.all([
    ctx.db.query<AttentionItem>(GET_PAGE_SQL, bound),
    ctx.db.query<AttentionContext>(GET_CTX_SQL, bound),
  ]);

  const ctxRow = context.rows[0];

  return {
    items: page.rows,
    context: ctxRow,
    empty_state: emptyState(ctxRow, page.rows.length),
    // Echoed so the screen can show its own thresholds ("quiet after 14
    // days") without hardcoding a number that would then drift from the one
    // the query actually used.
    tuning: {
      quiet_after_days:     cfg.quiet_after_days,
      follow_up_after_days: cfg.follow_up_after_days,
      page_size:            limit,
      offset,
    },
    recipe: 'attention-queue' as const,
  };
}
