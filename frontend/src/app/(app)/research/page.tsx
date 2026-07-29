'use client';

/**
 * Research — the manufacturing pilot, on a screen.
 *
 * Three things in the order they have to happen:
 *
 *   1. WHAT YOU SELL      — offers, with a checklist of what is still missing
 *   2. RESEARCH A COHORT  — queue the batch over a tagged set of companies
 *   3. THE BRIEFS         — read them, and decide who is actually worth a message
 *
 * Step 1 gates step 2 on purpose. Fit scoring against a half-written offer
 * produces a number that looks meaningful and is not, and that number decides
 * who gets contacted — so the button stays disabled and says why.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { formatDateTime } from '@/lib/format';
import {
  VdfPageHeader, VdfLoader, VdfStatCard, VdfEmptyState,
  VdfButton, VdfModal, VdfInput, VdfBadge,
} from '@/components/vdf';
import s from './research.module.css';

/* ── Types ──────────────────────────────────────────────────────────── */

type Commitment = 'entry' | 'project' | 'retainer';

interface Offer {
  id: string; name: string; one_line: string; who_for: string; problem: string;
  what_we_do: string[]; signals: string[]; disqualifiers: string[];
  price_band: string; proof: string; commitment: Commitment; is_ready: boolean;
}

/**
 * How big an ask each offer is — the axis the fit score deliberately does NOT
 * measure. The agent scores fit blind to this, then opens with the smallest
 * ask among the offers that fit equally well.
 */
const COMMITMENT_OPTIONS: { value: Commitment; label: string; hint: string }[] = [
  { value: 'entry', label: 'Entry', hint: 'A workshop, an audit, an assessment — something a stranger can say yes to.' },
  { value: 'project', label: 'Project', hint: 'Bounded delivery with a start and an end.' },
  { value: 'retainer', label: 'Retainer', hint: 'Ongoing. Almost never a sane first ask.' },
];

const COMMITMENT_SHORT: Record<Commitment, string> = {
  entry: 'entry ask', project: 'project', retainer: 'retainer',
};

interface Evidence { claim: string; url: string; excerpt: string }

interface Brief {
  id: number; prospect_id: number; ref: string | null; name: string;
  domain: string | null; status: string; pages_read: number;
  what_they_make: string | null; scale_signals: string | null;
  service_signals: string | null; digital_maturity: string | null;
  named_contacts: { name?: string; title?: string; email?: string }[];
  fit: Record<string, { score: number; reason: string }>;
  /** What the agent decided to open with. Never overwritten by a human. */
  recommended_offer: string | null;
  /** What the model scored highest, before the smallest-ask rule. */
  best_fit_offer: string | null;
  /** What the reviewer moved it to, if they did. */
  human_offer: string | null;
  effective_offer: string | null;
  /** Top score minus second. Under FIT_MARGIN the two are the same score. */
  fit_margin: string | number | null;
  fit_reason: string | null;
  hook: string | null; raw_evidence: Evidence[]; error: string | null;
  decision_note: string | null; decided_at: string | null;
  unevidenced: boolean; updated_at: string;
}

interface Tag { id: number; label: string }

type LessonKind = 'disqualifier' | 'sizing' | 'preference' | 'signal';

interface Lesson {
  id: number;
  lesson: string;
  edited_lesson: string | null;
  kind: LessonKind;
  applies_to: string | null;
  evidence: { company?: string; decision?: string; note?: string; offer?: string }[];
  status: 'proposed' | 'accepted' | 'rejected';
  proposed_at: string;
  decided_at: string | null;
}

const KIND_LABEL: Record<LessonKind, string> = {
  disqualifier: 'Reason to score down',
  sizing: 'How big or small',
  preference: 'Which offer to lead with',
  signal: 'What counts as evidence',
};

interface Split {
  selected: number; reachable: number; no_website: number;
  already_researched: number;
  /** Our pipeline failed — retried automatically. */
  extraction_failed: number;
  /** Their site did not answer — a finding about them, skipped by default. */
  no_address_answered: number;
  /** Facts already gathered; only the offer judgement is out of date. */
  needs_rescore: number;
  to_research: number;
  tokens_used_today: number | null;
  tokens_limit: number | null;
  /** Companies today's remaining tokens cover. null = nothing is metered. */
  affordable_today: number | null;
}

interface Budget {
  /** null = no cap for this tenant, which is the default. */
  limit: number | null;
  /** Always counted, cap or no cap — this is how you learn what a batch costs. */
  used: number | null;
  remaining: number | null;
  capped: boolean;
  tracked: boolean;
  cost_per_company: number; cost_per_rescore: number;
  affordable_companies: number | null; affordable_rescores: number | null;
}

interface BatchStatus {
  verdict: 'never_run' | 'queued' | 'running' | 'worker_down' | 'failed' | 'completed' | 'unknown';
  message: string;
  healthy: boolean;
  done_count: number;
  requested: number | null;
  run_status: string | null;
  error: string | null;
  /** Completed, but it did less than asked because the tokens ran out. */
  stopped_for_budget: boolean;
  not_attempted: number;
}

/** Badge variants the VDF library actually has. */
const STATUS_VARIANT: Record<string, 'default' | 'gold' | 'success' | 'info'> = {
  approved: 'success', drafted: 'info', unreadable: 'gold',
  extract_failed: 'gold', rejected: 'default', no_contact: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  drafted: 'Needs a decision', approved: 'Approved',
  // Deliberately different wording: one is about them, one is about us.
  unreadable: 'No usable website',
  extract_failed: 'Our extraction failed — retryable',
  rejected: 'Rejected', no_contact: 'Do not contact',
};

const lines = (xs: string[]) => xs.join('\n');
const toLines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

/**
 * A labelled textarea that GROWS to fit what is in it.
 *
 * MODULE SCOPE, deliberately: defined inside a component it becomes a new
 * type on every render and React remounts it — which is exactly how this
 * form lost focus on every keystroke.
 *
 * ── WHY IT AUTO-SIZES ─────────────────────────────────────────────────
 *
 * Fixed-height boxes gave every field its own scrollbar, nested inside the
 * modal's scrollbar. Nine fields, nine scrollbars, three visible lines of a
 * six-line value — you could never see one field whole, let alone compare
 * two. Widening the modal did not touch that; only growing the box does.
 */
function Area({ label, value, hint, onEdit, minRows = 3 }: {
  label: string; value: string; hint?: string;
  onEdit: (v: string) => void; minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Height follows content. Reset first — without it the box can only ever
  // grow, never shrink when text is deleted.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className={s.formRow}>
      <label className={s.formLabel}>{label}</label>
      <textarea
        ref={ref}
        className={s.textarea} value={value} rows={minRows}
        onChange={(e) => onEdit(e.target.value)}
      />
      {hint && <div className={s.formHint}>{hint}</div>}
    </div>
  );
}

const emptyOffer = (): Offer => ({
  id: '', name: '', one_line: '', who_for: '', problem: '',
  what_we_do: [], signals: [], disqualifiers: [], price_band: '', proof: '',
  commitment: 'project', is_ready: false,
});

/** NUMERIC comes back from pg as a string. Never trust it to be a number. */
const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Mirrors FIT_MARGIN in backend offer-catalogue.ts — change both together. */
const FIT_MARGIN = 0.15;

/* ── Page ───────────────────────────────────────────────────────────── */

export default function ResearchPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<Offer | null>(null);
  const [openBrief, setOpenBrief] = useState<Brief | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [offerFilter, setOfferFilter] = useState('');
  const [tagId, setTagId] = useState<number | ''>('');
  const [limit, setLimit] = useState(10);
  const [note, setNote] = useState('');
  const [reassign, setReassign] = useState('');
  const [redoExisting, setRedoExisting] = useState(false);

  const offersQ = useSkillQuery<{ offers: Offer[]; problems: string[]; ready: boolean }>(
    'research-skill', 'get_offers', {},
  );
  const briefsQ = useSkillQuery<{
    briefs: Brief[]; total: number; stats: Record<string, string>;
  }>('research-skill', 'get_briefs', {
    status: statusFilter || undefined,
    offer: offerFilter || undefined,
    limit: 50,
  });
  const tagsQ = useSkillQuery<{ records: unknown[]; facets: { tags: Tag[] } }>(
    'prospect-skill', 'get_records', { scope: 'mine', limit: 1 },
  );
  // Polled: the worker is a separate process, and "queued" means nothing if
  // nobody is reading the queue. 5s is fast enough to catch a dead worker
  // while a batch is being watched, and cheap — it is one indexed row.
  const statusQ = useSkillQuery<BatchStatus>(
    'research-skill', 'batch_status', {}, { refetchInterval: 5000 },
  );
  // What this batch would actually do, answered before the button is pressed
  // rather than discovered from the run. Queues nothing.
  const previewQ = useSkillQuery<Split>(
    'research-skill', 'start_research',
    { tag_id: tagId || undefined, preview: true },
    { enabled: tagId !== '' },
  );

  const lessonsQ = useSkillQuery<{
    lessons: Lesson[]; proposed: number; accepted: number; rejected: number;
    decisions: number; can_propose: boolean; min_decisions: number;
  }>('research-skill', 'get_lessons', {});

  const budgetQ = useSkillQuery<Budget>('research-skill', 'get_budget', {});

  const saveOffer = useSkillMutation('research-skill', 'save_offer');
  const setBudget = useSkillMutation('research-skill', 'set_budget');
  const deleteBriefs = useSkillMutation('research-skill', 'delete_briefs');
  const proposeLessons = useSkillMutation('research-skill', 'propose_lessons');
  const decideLesson = useSkillMutation('research-skill', 'decide_lesson');
  const startResearch = useSkillMutation('research-skill', 'start_research');
  const decide = useSkillMutation('research-skill', 'decide_brief');

  const offers = offersQ.data?.data.offers ?? [];
  const problems = offersQ.data?.data.problems ?? [];
  const ready = offersQ.data?.data.ready ?? false;
  const briefs = briefsQ.data?.data.briefs ?? [];
  const stats = briefsQ.data?.data.stats ?? {};
  const tags = (tagsQ.data?.data.facets?.tags ?? []) as Tag[];
  const batch = statusQ.data?.data;
  const split = previewQ.data?.data;
  const learn = lessonsQ.data?.data;
  const budget = budgetQ.data?.data;
  const lessons = learn?.lessons ?? [];
  const toResearch = redoExisting ? (split?.reachable ?? 0) : (split?.to_research ?? 0);

  const offerName = useMemo(() => {
    const m = new Map(offers.map((o) => [o.id, o.name]));
    return (key: string | null) => (key ? m.get(key) ?? key : null);
  }, [offers]);

  const commitmentOf = useMemo(() => {
    const m = new Map(offers.map((o) => [o.id, o.commitment]));
    return (key: string | null) => (key ? m.get(key) ?? null : null);
  }, [offers]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['skill', 'research-skill'] });
  };

  /* ── Handlers ─────────────────────────────────────────────────────── */

  const onSaveOffer = async (draft: Offer) => {
    try {
      await saveOffer.mutateAsync({
        offer_key: draft.id || undefined,
        name: draft.name,
        one_line: draft.one_line,
        who_for: draft.who_for,
        problem: draft.problem,
        what_we_do: draft.what_we_do,
        signals: draft.signals,
        disqualifiers: draft.disqualifiers,
        price_band: draft.price_band,
        proof: draft.proof,
        commitment: draft.commitment,
      });
      showToast({ type: 'success', message: `Saved “${draft.name}”` });
      setEditing(null);
      refresh();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not save the offer' });
    }
  };

  const onStart = async () => {
    try {
      const res = await startResearch.mutateAsync({
        tag_id: tagId || undefined, limit, refresh: redoExisting,
      });
      const { queued } = (res.data ?? {}) as unknown as { queued: number };
      showToast({
        type: 'success',
        message: `Queued ${queued} compan${queued === 1 ? 'y' : 'ies'}. `
          + 'The worker picks it up within a few seconds — each takes 2-4 minutes.',
      });
      previewQ.refetch();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not start the batch' });
    }
  };

  const onDecide = async (decision: 'approved' | 'rejected' | 'no_contact') => {
    if (!openBrief) return;
    try {
      await decide.mutateAsync({
        brief_id: openBrief.id,
        decision,
        offer_key: reassign || undefined,
        note: note || undefined,
      });
      showToast({
        type: 'success',
        message: decision === 'approved'
          ? 'Approved — ready to write to'
          : 'Ruled out, with your reason recorded',
      });
      setOpenBrief(null); setNote(''); setReassign('');
      refresh();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not record that decision' });
    }
  };

  const onSetBudget = async () => {
    // Empty is a real answer, and the default one — so this cannot bail on a
    // falsy value the way a "did they type anything" check would.
    const want = window.prompt(
      'Daily token cap for this tenant.\n\n'
      + 'Leave it EMPTY for no cap. That is the default: a cap exists only '
      + 'because you set one here.\n\n'
      + 'Account research costs roughly 14,000 tokens per company — a re-score '
      + 'about 3,500. A hundred companies is around 1.4 million.',
      budget?.limit === null ? '' : String(budget?.limit ?? ''),
    );
    if (want === null) return;   // cancelled, as opposed to cleared
    try {
      const res = await setBudget.mutateAsync({
        daily_token_limit: want.trim() === '' ? null : Number(want),
      });
      const { message } = (res.data ?? {}) as unknown as { message: string };
      showToast({ type: 'success', message });
      refresh(); previewQ.refetch();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not set the cap' });
    }
  };

  /**
   * Two calls on purpose: count first, then delete only if the human agrees to
   * that exact number. Nobody should be able to delete 144 briefs meaning to
   * delete 4.
   */
  const onDelete = async (scope: Record<string, unknown>, what: string) => {
    try {
      const dry = await deleteBriefs.mutateAsync(scope);
      const { matched, decided_included } = (dry.data ?? {}) as unknown as
        { matched: number; decided_included: number };
      if (matched === 0) {
        showToast({ type: 'info', message: `Nothing matches ${what}.` });
        return;
      }
      const ok = window.confirm(
        `Delete ${matched} brief${matched === 1 ? '' : 's'} — ${what}?\n\n`
        + (decided_included > 0
          ? `${decided_included} of them carry your own ruling, which the Learning `
            + 'Graph reads. That goes too.\n\n'
          : '')
        + 'The companies themselves are untouched and can be researched again.',
      );
      if (!ok) return;
      const res = await deleteBriefs.mutateAsync({ ...scope, confirm: true });
      const { deleted } = (res.data ?? {}) as unknown as { deleted: number };
      showToast({ type: 'success', message: `${deleted} brief(s) deleted` });
      refresh(); previewQ.refetch();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not delete' });
    }
  };

  const onPropose = async () => {
    try {
      const res = await proposeLessons.mutateAsync({});
      const { decisions } = (res.data ?? {}) as unknown as { decisions: number };
      showToast({
        type: 'success',
        message: `Reading your ${decisions} decisions. Proposals appear here in a `
          + 'minute or two — none of them changes scoring until you accept it.',
      });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not start' });
    }
  };

  const onDecideLesson = async (
    lesson: Lesson, decision: 'accepted' | 'rejected', edited?: string,
  ) => {
    try {
      await decideLesson.mutateAsync({
        lesson_id: lesson.id, decision, edited_lesson: edited || undefined,
      });
      showToast({
        type: 'success',
        message: decision === 'accepted'
          ? 'Accepted — every company scored from now on is judged against this. '
            + 'Undecided briefs can be re-scored without crawling.'
          : 'Thrown out, and it will not be proposed again.',
      });
      refresh();
      previewQ.refetch();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not record that' });
    }
  };

  if (offersQ.isLoading) return <VdfLoader message="Loading your offers" />;

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div className="page">
      <VdfPageHeader
        eyebrow="GTM RESEARCH"
        title="Research"
        meta="Read a company's own website before writing to them — and decide who is not worth writing to at all."
      />

      <div className="body">
        {/* 1 ── WHAT YOU SELL ─────────────────────────────────────── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <div>
              <div className={s.sectionTitle}>1. What you sell</div>
              <div className={s.sectionNote}>
                Every company&rsquo;s website is scored against these. The signals decide
                who fits; the disqualifiers are the only reason anything is ever ruled out.
              </div>
            </div>
            <VdfButton variant="outline" onClick={() => setEditing(emptyOffer())}>
              Add an offer
            </VdfButton>
          </div>

          {problems.length > 0 && (
            <div className={s.blocker}>
              <div className={s.blockerTitle}>
                Research cannot start yet — {problems.length} thing{problems.length === 1 ? '' : 's'} missing
              </div>
              <ul className={s.blockerList}>
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <div className={s.blockerWhy}>
                Scoring against a blank produces a number that looks meaningful and is not —
                and that number decides who gets contacted.
              </div>
            </div>
          )}

          <div className={s.offerGrid}>
            {offers.map((o) => (
              <div
                key={o.id} className={s.offerCard} role="button" tabIndex={0}
                onClick={() => setEditing(o)}
                onKeyDown={(e) => e.key === 'Enter' && setEditing(o)}
              >
                <div className={s.offerHead}>
                  <span className={s.offerName}>{o.name}</span>
                  <div className={s.badges}>
                    <VdfBadge variant="default">{COMMITMENT_SHORT[o.commitment]}</VdfBadge>
                    <VdfBadge variant={o.is_ready ? 'success' : 'gold'}>
                      {o.is_ready ? 'Ready' : 'Incomplete'}
                    </VdfBadge>
                  </div>
                </div>
                <div className={s.offerLine}>{o.one_line}</div>
                {!o.is_ready && (
                  <div className={s.offerMissing}>
                    Missing: {[
                      !o.price_band && 'price band',
                      !o.proof && 'proof',
                      o.signals.length === 0 && 'fit signals',
                      o.disqualifiers.length === 0 && 'disqualifiers',
                    ].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            ))}
            {offers.length === 0 && (
              <VdfEmptyState
                title="Nothing to sell yet"
                description="Add what you offer, and research can start scoring companies against it."
              />
            )}
          </div>
        </section>

        {/* 2 ── RESEARCH A COHORT ─────────────────────────────────── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <div>
              <div className={s.sectionTitle}>2. Research a cohort</div>
              <div className={s.sectionNote}>
                Only companies with a website can be researched. Start with ten and read
                them before running the rest — if the briefs read generic, the prompts
                need work, not another ninety crawls.
              </div>
            </div>
          </div>

          <div className={s.filters}>
            <select
              className={s.select} value={tagId}
              onChange={(e) => setTagId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Pick a cohort tag…</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select
              className={s.select} value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[10, 25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n} companies</option>
              ))}
            </select>
            <VdfButton
              variant="primary"
              onClick={onStart}
              disabled={!ready || !tagId || toResearch === 0 || startResearch.isPending}
            >
              {startResearch.isPending
                ? 'Queueing…'
                : `Research ${Math.min(limit, toResearch) || ''} compan${
                    Math.min(limit, toResearch) === 1 ? 'y' : 'ies'}`.trim()}
            </VdfButton>
            {!ready && (
              <span className={s.formHint}>Finish your offers above first.</span>
            )}
          </div>

          {/* ── Today's budget ─────────────────────────────────────────
              Above the split, not below it. A budget you can only discover by
              crashing into it is not a budget: the first real batch queued a
              hundred companies against a limit that covered seven, and found
              out at company eight. */}
          {budget?.tracked && (
            <div className={
              budget.capped && (budget.affordable_companies ?? 0) < 1
                ? s.budgetBad : s.budgetOk
            }>
              <div className={s.budgetLine}>
                <strong>
                  {(budget.used ?? 0).toLocaleString()} tokens used today
                  {budget.capped && <> of {(budget.limit ?? 0).toLocaleString()}</>}
                </strong>
                <span className={s.budgetAfford}>
                  {!budget.capped
                    ? 'no cap on this tenant'
                    : (budget.affordable_companies ?? 0) < 1
                      ? 'nothing more fits today'
                      : `about ${budget.affordable_companies} more compan${
                          budget.affordable_companies === 1 ? 'y' : 'ies'} · `
                        + `${budget.affordable_rescores} re-score${
                          budget.affordable_rescores === 1 ? '' : 's'}`}
                </span>
                <button type="button" className={s.linkButton} onClick={onSetBudget}>
                  {budget.capped ? 'Change or remove the cap' : 'Set a daily cap'}
                </button>
              </div>
              <div className={s.budgetNote}>
                {/* The meter stays visible with no cap on purpose. It is how you
                    find out what a batch of a hundred actually costs — and
                    without that number, any cap you ever set is a guess, which
                    is exactly how the old 100,000 default got here. */}
                Roughly {budget.cost_per_company.toLocaleString()} tokens per company
                researched, {budget.cost_per_rescore.toLocaleString()} to re-score one
                against changed offers.
                {budget.capped
                  ? ' The cap is yours, not the model’s — it resets at midnight UTC,'
                    + ' and a batch that runs out stops cleanly and keeps everything'
                    + ' it finished.'
                  : ' Counted so you can see what a batch costs; nothing here will'
                    + ' stop a run.'}
              </div>
            </div>
          )}

          {split && (
            <div className={s.split}>
              <span><strong>{split.selected}</strong> in this cohort</span>
              {split.no_website > 0 && (
                <span className={s.splitMuted}>
                  {split.no_website} with no website — nothing to read
                </span>
              )}
              {split.already_researched > 0 && (
                <span className={s.splitMuted}>
                  {split.already_researched} already researched
                </span>
              )}
              {split.extraction_failed > 0 && !redoExisting && (
                <span className={s.splitRetry}>
                  {split.extraction_failed} our extraction failed — retrying
                </span>
              )}
              {split.needs_rescore > 0 && !redoExisting && (
                <span className={s.splitRetry}>
                  {split.needs_rescore} re-scoring against your current offers — no crawl
                </span>
              )}
              {split.no_address_answered > 0 && !redoExisting && (
                <span className={s.splitMuted}>
                  {split.no_address_answered} no address answered — tick redo to try again
                </span>
              )}
              <span className={s.splitStrong}>{toResearch} to research</span>
              {split.affordable_today !== null && split.affordable_today < toResearch && (
                <span className={s.splitRetry}>
                  today&rsquo;s budget covers about {split.affordable_today} of them —
                  the rest stop cleanly and resume
                </span>
              )}

              {(split.already_researched > 0 || split.no_address_answered > 0) && (
                <label className={s.redo}>
                  <input
                    type="checkbox" checked={redoExisting}
                    onChange={(e) => setRedoExisting(e.target.checked)}
                  />
                  Redo existing briefs
                </label>
              )}
            </div>
          )}

          {batch && batch.verdict !== 'never_run' && (
            <div className={batch.healthy ? s.batchOk : s.batchBad}>
              <div className={s.batchLine}>
                <strong>
                  {batch.verdict === 'running' ? 'Running' :
                   batch.verdict === 'queued' ? 'Queued' :
                   batch.verdict === 'worker_down' ? 'Nothing is picking this up' :
                   batch.verdict === 'failed' ? 'Last batch failed' :
                   batch.stopped_for_budget ? 'Stopped early — budget spent' :
                   'Last batch finished'}
                </strong>
                {batch.requested !== null && (
                  <span className={s.batchProgress}>
                    {batch.done_count} of {batch.requested} companies
                  </span>
                )}
              </div>
              <div className={s.batchMessage}>{batch.message}</div>
              {batch.error && <div className={s.batchMessage}>{batch.error}</div>}
            </div>
          )}
        </section>

        {/* 3 ── THE BRIEFS ────────────────────────────────────────── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <div>
              <div className={s.sectionTitle}>3. The briefs</div>
              <div className={s.sectionNote}>
                One per company. The question is not whether it ran — it is whether any of
                this says something a template could not.
              </div>
            </div>
          </div>

          {Number(stats.total ?? 0) > 0 && (
            <div className={s.statGrid}>
              <VdfStatCard value={stats.total ?? 0} label="Researched" />
              <VdfStatCard value={stats.with_offer ?? 0} label="Offer suggested" accent="success" />
              <VdfStatCard value={stats.no_fit ?? 0} label="No fit" />
              <VdfStatCard
                value={stats.smaller_ask ?? 0} label="Smaller first ask"
                sub="best fit was too big to open with"
              />
              <VdfStatCard
                value={stats.fit_unclear ?? 0} label="Too close to call"
                accent={Number(stats.fit_unclear ?? 0) > Number(stats.with_offer ?? 0) / 2
                  ? 'warning' : 'default'}
                sub="top two inside the margin — your offers may not discriminate"
              />
              <VdfStatCard value={stats.unreadable ?? 0} label="No website" accent="warning" />
              <VdfStatCard
                value={stats.extract_failed ?? 0} label="Extraction failed"
                accent={Number(stats.extract_failed ?? 0) > 0 ? 'danger' : 'default'}
                sub="ours, not theirs — retry these"
              />
              <VdfStatCard
                value={stats.unevidenced ?? 0} label="No evidence"
                accent={Number(stats.unevidenced ?? 0) > 0 ? 'danger' : 'default'}
                sub="claims we could not verify"
              />
              <VdfStatCard value={stats.decided ?? 0} label="Decided" />
            </div>
          )}

          <div className={s.filters}>
            <select className={s.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All briefs</option>
              <option value="drafted">Needs a decision</option>
              <option value="approved">Approved</option>
              <option value="no_contact">Do not contact</option>
              <option value="rejected">Rejected</option>
              <option value="unreadable">No usable website</option>
              <option value="extract_failed">Extraction failed (retryable)</option>
            </select>
            <select className={s.select} value={offerFilter} onChange={(e) => setOfferFilter(e.target.value)}>
              <option value="">Any offer</option>
              {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value="none">No fit</option>
            </select>

            {/* Scoped deletes only. `refresh` re-crawls and overwrites, which
                is the right tool most of the time; this is for when a batch
                produced garbage and the rows are colouring the stats and the
                Learning Graph while you try to read them. Briefs you have
                ruled on are never included. */}
            {Number(stats.extract_failed ?? 0) > 0 && (
              <button
                type="button" className={s.linkButton}
                disabled={deleteBriefs.isPending}
                onClick={() => onDelete({ status: 'extract_failed' },
                  'the ones our extraction failed on')}
              >
                Delete the {stats.extract_failed} failed
              </button>
            )}
            {Number(stats.unreadable ?? 0) > 0 && (
              <button
                type="button" className={s.linkButton}
                disabled={deleteBriefs.isPending}
                onClick={() => onDelete({ status: 'unreadable' },
                  'the ones whose site did not answer')}
              >
                Delete the {stats.unreadable} unreadable
              </button>
            )}
            {tagId !== '' && (
              <button
                type="button" className={s.linkButtonDanger}
                disabled={deleteBriefs.isPending}
                onClick={() => onDelete({ tag_id: tagId },
                  `every undecided brief in ${tags.find((t) => t.id === tagId)?.label ?? 'this cohort'}`)}
              >
                Delete this cohort&rsquo;s research
              </button>
            )}
          </div>

          {briefsQ.isLoading ? (
            <VdfLoader message="Loading briefs" />
          ) : briefs.length === 0 ? (
            <VdfEmptyState
              title="No briefs yet"
              description="Finish your offers, pick a cohort and start research. Ten companies takes about half an hour."
            />
          ) : (
            <div className={s.briefList}>
              {briefs.map((b) => (
                <div
                  key={b.id} className={s.briefCard} role="button" tabIndex={0}
                  onClick={() => { setOpenBrief(b); setNote(''); setReassign(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && setOpenBrief(b)}
                >
                  <div className={s.briefHead}>
                    <div>
                      <span className={s.briefName}>{b.name}</span>{' '}
                      <span className={s.briefDomain}>{b.domain}</span>
                    </div>
                    <div className={s.badges}>
                      {b.unevidenced && <VdfBadge variant="gold" dot>No evidence</VdfBadge>}
                      {(b.effective_offer ?? b.recommended_offer)
                        ? <VdfBadge variant="success">
                            {offerName(b.effective_offer ?? b.recommended_offer)}
                          </VdfBadge>
                        : b.status !== 'unreadable' && <VdfBadge variant="default">No fit</VdfBadge>}
                      <VdfBadge variant={STATUS_VARIANT[b.status] ?? 'default'}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </VdfBadge>
                    </div>
                  </div>
                  {b.best_fit_offer && b.best_fit_offer !== b.recommended_offer && (
                    <div className={s.ladder}>
                      Fits <strong>{offerName(b.best_fit_offer)}</strong> best — opening
                      with <strong>{offerName(b.recommended_offer)}</strong>, the smaller ask
                      in the same fit band.
                    </div>
                  )}
                  {num(b.fit_margin) !== null && num(b.fit_margin)! < FIT_MARGIN
                    && b.recommended_offer && (
                    <div className={s.unclear}>
                      Top two offers within {num(b.fit_margin)!.toFixed(2)} — not
                      distinguishable on what the site says.
                    </div>
                  )}
                  {b.hook && <div className={s.briefHook}>{b.hook}</div>}
                  {b.what_they_make && <div className={s.briefMakes}>{b.what_they_make}</div>}
                  {(b.status === 'unreadable' || b.status === 'extract_failed') && b.error && (
                    <div className={s.briefMakes}>{b.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        {/* 4 ── WHAT IT HAS LEARNED ───────────────────────────────── */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <div>
              <div className={s.sectionTitle}>
                What it has learned from you
                {(learn?.proposed ?? 0) > 0 && (
                  <> <VdfBadge variant="gold" dot>{learn!.proposed} to review</VdfBadge></>
                )}
              </div>
              <div className={s.sectionNote}>
                Every brief you approve or rule out teaches it something. Ask it what it
                has noticed, and it proposes rules with the companies each one came from.
                Nothing it proposes changes a score until you accept it.
              </div>
            </div>
            <VdfButton
              variant="outline"
              onClick={onPropose}
              disabled={!learn?.can_propose || proposeLessons.isPending}
            >
              {proposeLessons.isPending ? 'Reading…' : 'What have you learned?'}
            </VdfButton>
          </div>

          {learn && !learn.can_propose && (
            <div className={s.formHint}>
              {learn.decisions} decision{learn.decisions === 1 ? '' : 's'} so far —
              rules are inferred from {learn.min_decisions} or more. Below that a
              &ldquo;rule&rdquo; is just a description of a handful of companies, and it
              would go on to decide who gets contacted.
            </div>
          )}

          {lessons.length > 0 && (
            <div className={s.lessonList}>
              {lessons.map((l) => (
                <LessonCard
                  key={l.id} lesson={l} offerName={offerName}
                  busy={decideLesson.isPending}
                  onDecide={(d, edited) => onDecideLesson(l, d, edited)}
                />
              ))}
            </div>
          )}

          {learn && lessons.length === 0 && learn.can_propose && (
            <VdfEmptyState
              title="Nothing proposed yet"
              description={`${learn.decisions} decisions are waiting to be read. Ask it what it has noticed.`}
            />
          )}
        </section>

      </div>

      {/* ── Offer editor ───────────────────────────────────────────── */}
      <VdfModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? editing.name : 'New offer'}
        subtitle="Everything here is read by the agent — and some of it reaches a prospect."
        width="xl"
      >
        {editing && (
          <OfferForm
            key={editing.id || 'new'}
            initial={editing}
            saving={saveOffer.isPending}
            onCancel={() => setEditing(null)}
            onSave={onSaveOffer}
          />
        )}
      </VdfModal>

      {/* ── Brief detail + decision ────────────────────────────────── */}
      <VdfModal
        isOpen={openBrief !== null}
        onClose={() => setOpenBrief(null)}
        title={openBrief?.name}
        subtitle={openBrief?.domain ?? undefined}
        width="lg"
        footer={openBrief
          && openBrief.status !== 'unreadable'
          && openBrief.status !== 'extract_failed' ? (
          <div className={s.actions}>
            <VdfButton variant="primary" onClick={() => onDecide('approved')} disabled={decide.isPending}>
              Approve
            </VdfButton>
            <VdfButton variant="outline" onClick={() => onDecide('no_contact')} disabled={decide.isPending}>
              Do not contact
            </VdfButton>
            <VdfButton variant="ghost" onClick={() => onDecide('rejected')} disabled={decide.isPending}>
              Reject
            </VdfButton>
          </div>
        ) : undefined}
      >
        {openBrief && (
          <BriefDetail
            brief={openBrief} offers={offers}
            offerName={offerName} commitmentOf={commitmentOf}
            note={note} setNote={setNote}
            reassign={reassign} setReassign={setReassign}
          />
        )}
      </VdfModal>
    </div>
  );
}

/* ── Offer form ─────────────────────────────────────────────────────── */

/**
 * One offer, edited.
 *
 * ── WHY THIS OWNS ITS OWN STATE ───────────────────────────────────────
 *
 * The first version lifted every keystroke to the page and defined the
 * textarea component INSIDE this function. Both are bugs, and together they
 * made the form unusable — React saw a new component type on every render
 * and remounted the textarea, so focus was lost after every single
 * character. The only way to fill it in was to paste.
 *
 * So: `Field` and `Area` live at module scope, and the draft lives here.
 * The page learns about it once, on save. Nothing re-renders while typing
 * except this form.
 */
function OfferForm({
  initial, onSave, onCancel, saving,
}: {
  initial: Offer;
  onSave: (o: Offer) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  // Keyed by offer id at the call site, so opening a different offer
  // remounts with fresh state rather than showing the previous one.
  const [draft, setDraft] = useState<Offer>(initial);
  const set = (patch: Partial<Offer>) => setDraft((d) => ({ ...d, ...patch }));

  const missing = [
    !draft.price_band.trim() && 'price band',
    !draft.proof.trim() && 'proof',
    draft.signals.length === 0 && 'fit signals',
    draft.disqualifiers.length === 0 && 'disqualifiers',
  ].filter(Boolean) as string[];

  return (
    <>
      <div className={s.offerForm}>
        {/* Left: what the offer IS. */}
        <div className={s.offerCol}>
          <div className={s.colHead}>What it is</div>

          <div className={s.formRow}>
            <label className={s.formLabel}>Name</label>
            <input
              className={s.input} value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="CDO as a Service"
            />
          </div>

          <Area
            label="One line" value={draft.one_line} minRows={2}
            onEdit={(v) => set({ one_line: v })}
            hint="How you would describe it in a sentence."
          />
          <Area
            label="Who it is for" value={draft.who_for} minRows={3}
            onEdit={(v) => set({ who_for: v })}
          />
          <Area
            label="Problem it solves" value={draft.problem} minRows={5}
            onEdit={(v) => set({ problem: v })}
          />
          <Area
            label="What you do" value={lines(draft.what_we_do)} minRows={5}
            onEdit={(v) => set({ what_we_do: toLines(v) })}
            hint="One per line."
          />
        </div>

        {/* Right: how a company gets matched to it. */}
        <div className={s.offerCol}>
          <div className={s.colHead}>How it gets matched</div>

          <Area
            label="Fit signals" value={lines(draft.signals)} minRows={7}
            onEdit={(v) => set({ signals: toLines(v) })}
            hint="One per line. What on a company's website tells you this fits — this is what the agent actually looks for, so concrete beats descriptive."
          />
          <Area
            label="Do NOT pitch this when" value={lines(draft.disqualifiers)} minRows={5}
            onEdit={(v) => set({ disqualifiers: toLines(v) })}
            hint="One per line. Without these the agent always finds a reason to say yes."
          />
          <div className={s.formRow}>
            <label className={s.formLabel}>How big an ask is it</label>
            <select
              className={s.select} value={draft.commitment}
              onChange={(e) => set({ commitment: e.target.value as Commitment })}
            >
              {COMMITMENT_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <div className={s.formHint}>
              {COMMITMENT_OPTIONS.find((c) => c.value === draft.commitment)?.hint}
              {' '}The agent scores fit without seeing this — then, among the offers
              that fit a company equally well, it opens with the smallest ask.
            </div>
          </div>

          <Area
            label="Price band" value={draft.price_band} minRows={2}
            onEdit={(v) => set({ price_band: v })}
            hint="What it costs. This is what makes “too small for this” a judgement rather than a guess."
          />
          <Area
            label="Proof" value={draft.proof} minRows={4}
            onEdit={(v) => set({ proof: v })}
            hint="What you can stand behind in writing. No case study yet? Say what is actually true — credentials, adjacent work. Never invent one; a real prospect can check."
          />
        </div>
      </div>

      <div className={s.offerFooter}>
        <div className={s.formHint}>
          {missing.length > 0
            ? `Still needed before research can run: ${missing.join(', ')}.`
            : 'Ready to score companies against.'}
        </div>
        <div className={s.actions}>
          <VdfButton variant="outline" onClick={onCancel}>Cancel</VdfButton>
          <VdfButton
            variant="primary" disabled={saving || !draft.name.trim()}
            onClick={() => onSave(draft)}
          >
            {saving ? 'Saving…' : 'Save offer'}
          </VdfButton>
        </div>
      </div>
    </>
  );
}

/* ── One proposed rule ──────────────────────────────────────────────── */

/**
 * A rule the agent inferred, and the decision a human owes it.
 *
 * ── WHY THE EVIDENCE IS NOT COLLAPSED BEHIND A TOGGLE ─────────────────
 *
 * Accepting a rule here changes which real companies get contacted. The only
 * way to judge one is against the decisions it came from — and a rule whose
 * evidence you have to go looking for gets accepted on how confident it
 * sounds. So the companies and the reviewer's own words are on the card,
 * always, next to the buttons.
 *
 * ── WHY REWORDING IS A FIRST-CLASS ACTION ─────────────────────────────
 *
 * The inference is usually close and rarely exactly right. "They reject small
 * companies" wants to be "reject single-plant companies with no stated
 * exports". Making the reviewer choose between accepting a sentence they half
 * agree with and rejecting one that is nearly correct throws away the useful
 * half of the work.
 */
function LessonCard({ lesson, offerName, busy, onDecide }: {
  lesson: Lesson;
  offerName: (k: string | null) => string | null;
  busy: boolean;
  onDecide: (decision: 'accepted' | 'rejected', edited?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lesson.edited_lesson ?? lesson.lesson);
  const pending = lesson.status === 'proposed';

  return (
    <div className={pending ? s.lessonCard : s.lessonCardDecided}>
      <div className={s.lessonHead}>
        <div className={s.badges}>
          <VdfBadge variant="default">{KIND_LABEL[lesson.kind] ?? lesson.kind}</VdfBadge>
          {lesson.applies_to && (
            <VdfBadge variant="info">{offerName(lesson.applies_to)}</VdfBadge>
          )}
          {lesson.status === 'accepted' && <VdfBadge variant="success">In use</VdfBadge>}
          {lesson.status === 'rejected' && <VdfBadge variant="default">Thrown out</VdfBadge>}
        </div>
        <span className={s.lessonWhen}>{formatDateTime(lesson.proposed_at)}</span>
      </div>

      {editing ? (
        <Area
          label="Your wording" value={draft} minRows={3}
          onEdit={setDraft}
          hint="It has to be testable against a company brief. “Too small” cannot be; “single plant with no stated exports” can."
        />
      ) : (
        <div className={s.lessonText}>{lesson.edited_lesson ?? lesson.lesson}</div>
      )}

      {lesson.edited_lesson && !editing && (
        <div className={s.lessonOriginal}>
          It originally said: &ldquo;{lesson.lesson}&rdquo;
        </div>
      )}

      {lesson.evidence.length > 0 && (
        <div className={s.lessonEvidence}>
          <div className={s.detailLabel}>
            Inferred from {lesson.evidence.length} of your decisions
          </div>
          {lesson.evidence.map((e, i) => (
            <div key={i} className={s.lessonCase}>
              <strong>{e.company}</strong>
              {e.decision && <> — {STATUS_LABEL[e.decision] ?? e.decision}</>}
              {e.offer && <> · {offerName(e.offer)}</>}
              {e.note && <div className={s.lessonNote}>&ldquo;{e.note}&rdquo;</div>}
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className={s.actions}>
          {editing ? (
            <>
              <VdfButton
                variant="primary" disabled={busy || draft.trim().length < 20}
                onClick={() => onDecide('accepted', draft.trim())}
              >
                Accept my wording
              </VdfButton>
              <VdfButton variant="ghost" onClick={() => setEditing(false)}>Cancel</VdfButton>
            </>
          ) : (
            <>
              <VdfButton variant="primary" disabled={busy} onClick={() => onDecide('accepted')}>
                Accept
              </VdfButton>
              <VdfButton variant="outline" onClick={() => setEditing(true)}>
                Reword it
              </VdfButton>
              <VdfButton variant="ghost" disabled={busy} onClick={() => onDecide('rejected')}>
                Throw out
              </VdfButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Brief detail ───────────────────────────────────────────────────── */

function BriefDetail({
  brief, offers, offerName, commitmentOf, note, setNote, reassign, setReassign,
}: {
  brief: Brief; offers: Offer[]; offerName: (k: string | null) => string | null;
  commitmentOf: (k: string | null) => Commitment | null;
  note: string; setNote: (v: string) => void;
  reassign: string; setReassign: (v: string) => void;
}) {
  const Field = ({ label, value }: { label: string; value: string | null }) =>
    value ? (
      <div className={s.detailField}>
        <div className={s.detailLabel}>{label}</div>
        <div className={s.detailValue}>{value}</div>
      </div>
    ) : null;

  if (brief.status === 'unreadable' || brief.status === 'extract_failed') {
    const ours = brief.status === 'extract_failed';
    return (
      <>
        <div className={s.detailField}>
          <div className={s.detailLabel}>
            {ours ? 'Our extraction failed' : 'No address answered'}
          </div>
          <div className={s.detailValue}>{brief.error}</div>
        </div>
        <div className={s.formHint}>
          {ours
            ? 'This says nothing about the company — their site read fine and our own '
              + 'step fell over. Re-running the batch will pick it up again.'
            : 'No brief was invented for this one. An invented detail in a first message '
              + 'is the one mistake that cannot be walked back.'}
        </div>
      </>
    );
  }

  return (
    <>
      {brief.hook && (
        <div className={s.detailField}>
          <div className={s.detailLabel}>Opening observation</div>
          <div className={s.briefHook}>{brief.hook}</div>
        </div>
      )}

      <Field label="What they make" value={brief.what_they_make} />
      <Field label="Scale" value={brief.scale_signals} />
      <Field label="Service / AMC" value={brief.service_signals} />
      <Field label="Digital maturity" value={brief.digital_maturity} />

      {brief.named_contacts?.length > 0 && (
        <div className={s.detailField}>
          <div className={s.detailLabel}>Contacts on the site</div>
          {brief.named_contacts.map((c, i) => (
            <div key={i} className={s.detailValue}>
              {[c.name, c.title, c.email].filter(Boolean).join(' · ')}
            </div>
          ))}
        </div>
      )}

      <div className={s.detailField}>
        <div className={s.detailLabel}>
          Fit — {offerName(brief.effective_offer ?? brief.recommended_offer) ?? 'nothing fits'}
        </div>

        {/* The reviewer's own correction, kept visible. This pair — what the
            agent proposed against what a human settled on — is what the
            Learning Graph is built from, and it used to be overwritten. */}
        {brief.human_offer && brief.human_offer !== brief.recommended_offer && (
          <div className={s.ladder}>
            You moved this from <strong>{offerName(brief.recommended_offer) ?? 'no fit'}</strong>
            {' '}to <strong>{offerName(brief.human_offer)}</strong>. The agent&rsquo;s
            proposal is kept below so the difference can be learned from.
          </div>
        )}

        {/* Both numbers, always, when the rule moved anything. Showing only
            the recommendation would hide the rule from the person being asked
            to trust it. */}
        {brief.best_fit_offer && brief.best_fit_offer !== brief.recommended_offer && (
          <div className={s.ladder}>
            The model scored <strong>{offerName(brief.best_fit_offer)}</strong> highest
            {commitmentOf(brief.best_fit_offer)
              && ` (${COMMITMENT_SHORT[commitmentOf(brief.best_fit_offer)!]})`}.
            {' '}Opening with <strong>{offerName(brief.recommended_offer)}</strong>
            {commitmentOf(brief.recommended_offer)
              && ` (${COMMITMENT_SHORT[commitmentOf(brief.recommended_offer)!]})`}
            {' '}instead: it scores inside {FIT_MARGIN.toFixed(2)} of the top and is a
            far smaller thing to say yes to. Approve with a different offer below if
            you disagree.
          </div>
        )}

        {num(brief.fit_margin) !== null && brief.recommended_offer && (
          num(brief.fit_margin)! < FIT_MARGIN ? (
            <div className={s.unclear}>
              Top two offers are {num(brief.fit_margin)!.toFixed(2)} apart. That is
              inside the noise of the model&rsquo;s own judgement — treat them as tied,
              not ranked.
            </div>
          ) : (
            <div className={s.formHint}>
              Clear by {num(brief.fit_margin)!.toFixed(2)} over the next offer.
            </div>
          )
        )}

        {brief.fit_reason && <div className={s.detailValue}>{brief.fit_reason}</div>}
        {Object.entries(brief.fit ?? {})
          .sort((a, b) => b[1].score - a[1].score)
          .map(([id, f]) => (
            <div key={id} className={s.fitRow}>
              <span className={s.fitScore}>{Number(f.score).toFixed(2)}</span>
              <span className={s.fitReason}>
                {offerName(id)}
                {commitmentOf(id) && ` · ${COMMITMENT_SHORT[commitmentOf(id)!]}`}
                {' — '}{f.reason}
              </span>
            </div>
          ))}
      </div>

      <div className={s.detailField}>
        <div className={s.detailLabel}>
          Evidence — {brief.raw_evidence?.length ?? 0} claim(s) found on pages we actually read
        </div>
        {(brief.raw_evidence ?? []).map((e, i) => (
          <div key={i} className={s.evidence}>
            <div className={s.evidenceClaim}>{e.claim}</div>
            <a className={s.evidenceUrl} href={e.url} target="_blank" rel="noreferrer">{e.url}</a>
            <div className={s.evidenceExcerpt}>&ldquo;{e.excerpt}&rdquo;</div>
          </div>
        ))}
        {brief.unevidenced && (
          <div className={s.formHint}>
            Nothing here could be verified against the pages read. Treat every claim above
            as unconfirmed — do not put any of it in a message.
          </div>
        )}
      </div>

      <div className={s.formRow}>
        <label className={s.formLabel}>Approve with a different offer</label>
        <select className={s.select} value={reassign} onChange={(e) => setReassign(e.target.value)}>
          <option value="">
            Keep {offerName(brief.effective_offer ?? brief.recommended_offer) ?? 'as no fit'}
          </option>
          {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      <div className={s.formRow}>
        <label className={s.formLabel}>Why (required to rule a company out)</label>
        <textarea
          className={s.textarea} value={note} rows={2}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Too small · wrong segment · no real problem here · site says nothing useful"
        />
        <div className={s.formHint}>
          These reasons are the pilot&rsquo;s most useful output after the reply rate — they
          tell us whether the segment was wrong, the offer was wrong, or the research
          simply could not see enough.
        </div>
      </div>

      {brief.decided_at && (
        <div className={s.formHint}>
          Last decided {formatDateTime(brief.decided_at)}
          {brief.decision_note ? ` — “${brief.decision_note}”` : ''}
        </div>
      )}
    </>
  );
}
