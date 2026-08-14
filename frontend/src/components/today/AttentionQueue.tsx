'use client';

/**
 * /today — the quiet accounts queue.
 *
 * Which relationships have gone silent, why, and in what order. The ranking
 * and the thresholds live in the backend (attention-skill + attention.config
 * .ts); this file renders what it is told and never re-derives a verdict.
 * That includes the empty states: `empty_state` arrives decided, because four
 * different kinds of empty rendered as one generic "nothing to show" is three
 * wrong answers.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfCard, VdfButton, VdfStatusBadge, VdfEmptyState, VdfModal, VdfLoader,
} from '@/components/vdf';
import s from './attention-queue.module.css';

/* ── What the skill returns ─────────────────────────────────────────── */

type Reason =
  | 'wake_due' | 'owed_reply' | 'story_unsent' | 'gone_quiet' | 'never_touched';

interface AttentionItem {
  journey_id: string;
  prospect_id: string;
  company: string;
  ref: string | null;
  city: string | null;
  journey_state: string;
  offer: string | null;
  reason: Reason;
  days_quiet: number;
  last_touch_at: string | null;
  last_outcome: string | null;
  last_channel: string | null;
  wake_at: string | null;
  score: number;
  standing_decision: string | null;
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
}

type EmptyState =
  | 'has_items' | 'no_accounts' | 'none_in_play' | 'all_current' | 'all_handled';

interface AttentionData {
  items: AttentionItem[];
  context: AttentionContext;
  empty_state: EmptyState;
  tuning: { quiet_after_days: number; page_size: number; offset: number };
}

/* ── Presentation of the reasons ────────────────────────────────────── */

/** Copy is per-reason on purpose. "Needs attention" on every row tells an
 *  operator nothing they could act on; the reason IS the instruction. */
const REASON: Record<Reason, {
  label: string;
  tone: 'warning' | 'danger' | 'info' | 'muted' | 'success';
  line: (i: AttentionItem) => string;
}> = {
  wake_due: {
    label: 'Reminder due',
    tone: 'warning',
    line: (i) => `You parked this and asked to be reminded${
      i.wake_at ? ` on ${fmtDate(i.wake_at)}` : ''}.`,
  },
  owed_reply: {
    label: 'They replied',
    tone: 'danger',
    line: (i) => `They answered ${ago(i.days_quiet)} and we have not come back.`,
  },
  story_unsent: {
    label: 'Story unsent',
    tone: 'info',
    line: (i) => `An approved story has been sitting unsent for ${ago(i.days_quiet)}${
      i.offer ? ` — ${i.offer}` : ''}.`,
  },
  gone_quiet: {
    label: 'Gone quiet',
    tone: 'muted',
    line: (i) => `Last touched ${ago(i.days_quiet)}${
      i.last_channel ? ` by ${i.last_channel}` : ''}. No answer.`,
  },
  never_touched: {
    label: 'Never contacted',
    tone: 'muted',
    line: (i) => `In play for ${ago(i.days_quiet)} and never contacted.`,
  },
};

function ago(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN',
    { day: 'numeric', month: 'short', year: 'numeric' });
}

const SNOOZE_CHOICES = [
  { label: '3 days', days: 3 },
  { label: 'A week', days: 7 },
  { label: 'A month', days: 30 },
];

/* ── The queue ──────────────────────────────────────────────────────── */

export function AttentionQueue() {
  const router = useRouter();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [snoozeFor, setSnoozeFor] = useState<AttentionItem | null>(null);
  const [dismissing, setDismissing] = useState<AttentionItem | null>(null);
  const [dismissReason, setDismissReason] = useState('');

  const params = { include_dismissed: includeDismissed };
  const { data, isLoading, isError, error } =
    useSkillQuery<AttentionData>('attention-skill', 'get_attention', params);

  const decide = useSkillMutation('attention-skill', 'decide_attention');

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['skill', 'attention-skill', 'get_attention'] });

  /** The `shown` payload is frozen on the decision row so a later retune
   *  cannot rewrite what the operator was actually looking at. */
  const shownOf = (i: AttentionItem) => ({
    days_quiet: i.days_quiet,
    score: i.score,
    journey_state: i.journey_state,
    reason: i.reason,
    last_touch_at: i.last_touch_at,
    company: i.company,
  });

  async function record(
    item: AttentionItem,
    decision: 'acted' | 'snoozed' | 'dismissed' | 'reopened',
    extra: Record<string, unknown> = {},
  ): Promise<boolean> {
    try {
      await decide.mutateAsync({
        prospect_id: Number(item.prospect_id),
        decision,
        shown: shownOf(item),
        ...extra,
      });
      await refresh();
      return true;
    } catch (e) {
      showToast({ message: (e as Error).message || 'Could not record that', type: 'error' });
      return false;
    }
  }

  async function act(item: AttentionItem) {
    // Recording first, navigating second: if the write fails the operator
    // stays put and sees why, rather than landing on an account page while
    // the queue quietly forgot they were ever here.
    if (!(await record(item, 'acted'))) return;
    router.push(item.ref ? `/gtm/audience/qualify/${item.ref}` : '/gtm/journeys');
  }

  async function confirmSnooze(days: number) {
    if (!snoozeFor) return;
    const item = snoozeFor;
    setSnoozeFor(null);
    if (await record(item, 'snoozed', { snooze_days: days })) {
      showToast({ message: `${item.company} — back in ${days} days`, type: 'success' });
    }
  }

  async function confirmDismiss() {
    if (!dismissing) return;
    const item = dismissing;
    const reason = dismissReason.trim();
    if (!reason) return;
    setDismissing(null);
    setDismissReason('');
    if (await record(item, 'dismissed', { reason })) {
      showToast({ message: `${item.company} dismissed`, type: 'success' });
    }
  }

  if (isError) {
    return (
      <VdfEmptyState
        icon="⚠"
        title="Could not load your queue"
        description={error?.message ?? 'Something went wrong.'}
        action={<VdfButton variant="outline" onClick={() => refresh()}>Try again</VdfButton>}
      />
    );
  }

  // Gate on the DATA, not on isLoading.
  //
  // useSkillQuery sets `enabled: !!getAccessToken()`, and a disabled query in
  // react-query v5 is `pending` but NOT fetching — so isLoading is false while
  // data is still undefined. That is the state on first paint before the token
  // is readable, and an `isLoading` guard walks straight past it. The `data!`
  // that used to follow asserted away the one case that actually occurs.
  //
  // isLoading stays in the condition so a genuine refetch still shows the
  // loader rather than flashing stale-empty.
  if (isLoading || !data) {
    return <div className={s.loading}><VdfLoader /></div>;
  }

  const { items, context: ctx, empty_state: state, tuning } = data.data;

  return (
    <section className={s.wrap}>
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>NEEDS YOU TODAY</div>
          <h2 className={s.title}>
            {items.length > 0
              ? `${ctx.surfaced} ${ctx.surfaced === 1 ? 'account' : 'accounts'} waiting on you`
              : 'Nothing waiting on you'}
          </h2>
        </div>
        {(ctx.suppressed_dismissed > 0 || includeDismissed) && (
          <VdfButton
            variant="ghost"
            size="sm"
            onClick={() => setIncludeDismissed((v) => !v)}
          >
            {includeDismissed
              ? 'Hide dismissed'
              : `Show ${ctx.suppressed_dismissed} dismissed`}
          </VdfButton>
        )}
      </header>

      {items.length === 0
        ? <Empty state={state} ctx={ctx} quietAfter={tuning.quiet_after_days} router={router} />
        : (
          <ul className={s.list}>
            {items.map((i) => {
              const r = REASON[i.reason];
              const isDismissed = i.standing_decision === 'dismissed';
              return (
                <li key={i.prospect_id}>
                  <VdfCard hoverLift={false} className={`${s.item} ${isDismissed ? s.itemDismissed : ''}`}>
                    <div className={s.itemMain}>
                      <div className={s.itemTop}>
                        <span className={s.company}>{i.company}</span>
                        <VdfStatusBadge label={r.label} variant={r.tone} size="sm" />
                        {i.ref && <span className={s.ref}>{i.ref}</span>}
                        {i.city && <span className={s.city}>{i.city}</span>}
                      </div>
                      <p className={s.why}>{r.line(i)}</p>
                    </div>

                    <div className={s.actions}>
                      {isDismissed ? (
                        <VdfButton variant="outline" size="sm" onClick={() => record(i, 'reopened')}>
                          Reopen
                        </VdfButton>
                      ) : (
                        <>
                          <VdfButton variant="primary" size="sm" onClick={() => act(i)}>
                            Take it on
                          </VdfButton>
                          <VdfButton variant="ghost" size="sm" onClick={() => setSnoozeFor(i)}>
                            Later
                          </VdfButton>
                          <VdfButton variant="ghost" size="sm" onClick={() => setDismissing(i)}>
                            Dismiss
                          </VdfButton>
                        </>
                      )}
                    </div>
                  </VdfCard>
                </li>
              );
            })}
          </ul>
        )}

      {/* Suppressed work is stated, not hidden. A queue that silently drops
          items is one nobody can trust to be the whole list. */}
      {items.length > 0 && (ctx.suppressed_handled > 0 || ctx.suppressed_snoozed > 0) && (
        <p className={s.foot}>
          {ctx.suppressed_handled > 0 && (
            <span>{ctx.suppressed_handled} already scheduled. </span>
          )}
          {ctx.suppressed_snoozed > 0 && (
            <span>
              {ctx.suppressed_snoozed} snoozed
              {ctx.next_snooze_due ? `, next back ${fmtDate(ctx.next_snooze_due)}` : ''}.
            </span>
          )}
        </p>
      )}

      {/* ── Later ── */}
      <VdfModal
        isOpen={snoozeFor !== null}
        onClose={() => setSnoozeFor(null)}
        title="Come back to this when?"
        subtitle={snoozeFor?.company}
      >
        <div className={s.snoozeRow}>
          {SNOOZE_CHOICES.map((c) => (
            <VdfButton key={c.days} variant="outline" onClick={() => confirmSnooze(c.days)}>
              {c.label}
            </VdfButton>
          ))}
        </div>
      </VdfModal>

      {/* ── Dismiss ── */}
      <VdfModal
        isOpen={dismissing !== null}
        onClose={() => { setDismissing(null); setDismissReason(''); }}
        title="Why are you dismissing this?"
        subtitle={dismissing?.company}
        footer={
          <>
            <VdfButton variant="ghost" onClick={() => { setDismissing(null); setDismissReason(''); }}>
              Cancel
            </VdfButton>
            <VdfButton variant="danger" disabled={!dismissReason.trim()} onClick={confirmDismiss}>
              Dismiss
            </VdfButton>
          </>
        }
      >
        <p className={s.modalNote}>
          Six weeks from now, a considered &ldquo;not our market&rdquo; and a mis-click
          look identical without one. Nothing is deleted — dismissed accounts can be
          reopened.
        </p>
        <textarea
          className={s.reasonInput}
          value={dismissReason}
          onChange={(e) => setDismissReason(e.target.value)}
          placeholder="Not our market. Wrong size. Already a customer…"
          rows={3}
          autoFocus
        />
      </VdfModal>
    </section>
  );
}

/* ── The four kinds of empty ────────────────────────────────────────── */

function Empty({ state, ctx, quietAfter, router }: {
  state: EmptyState;
  ctx: AttentionContext;
  quietAfter: number;
  router: ReturnType<typeof useRouter>;
}) {
  switch (state) {
    case 'no_accounts':
      return (
        <VdfEmptyState
          icon="◇"
          title="No companies yet"
          description="This screen watches the relationships you already have. Bring some companies in and it starts working."
          action={
            <VdfButton variant="primary" onClick={() => router.push('/gtm/audience/find')}>
              Find companies
            </VdfButton>
          }
        />
      );

    case 'none_in_play':
      // Deliberately NOT "all caught up". Nothing is caught up; nothing has
      // been qualified yet, and saying otherwise misdescribes an empty
      // pipeline as a clean one.
      return (
        <VdfEmptyState
          icon="◷"
          title="Nothing is in play yet"
          description={`${ctx.prospects_total} ${ctx.prospects_total === 1 ? 'company' : 'companies'} on file, none qualified. Follow-ups start once a company is worth pursuing — that decision happens in research.`}
          action={
            <VdfButton variant="primary" onClick={() => router.push('/gtm/audience/qualify')}>
              Qualify companies
            </VdfButton>
          }
        />
      );

    case 'all_handled':
      return (
        <VdfEmptyState
          icon="✓"
          title="You're done for today"
          description={[
            ctx.suppressed_handled > 0 ? `${ctx.suppressed_handled} already scheduled` : '',
            ctx.suppressed_snoozed > 0
              ? `${ctx.suppressed_snoozed} snoozed${ctx.next_snooze_due ? `, next back ${fmtDate(ctx.next_snooze_due)}` : ''}`
              : '',
            ctx.suppressed_dismissed > 0 ? `${ctx.suppressed_dismissed} dismissed` : '',
          ].filter(Boolean).join(' · ')}
        />
      );

    case 'all_current':
    default:
      return (
        <VdfEmptyState
          icon="✓"
          title="Everything is current"
          description={`${ctx.journeys_in_play} ${ctx.journeys_in_play === 1 ? 'relationship' : 'relationships'} in play, none quiet for more than ${quietAfter} days.${
            ctx.in_play_never_touched > 0
              ? ` ${ctx.in_play_never_touched} have never been contacted — they appear here once they have been in play for ${quietAfter} days.`
              : ''
          }`}
        />
      );
  }
}
