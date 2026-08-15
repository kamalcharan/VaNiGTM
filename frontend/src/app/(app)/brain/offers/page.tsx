'use client';

/**
 * Offers — the tenant's Brain object for what it sells (Intelligent Add
 * Offers, 2026-08-15).
 *
 * Same agent-proposes/human-confirms shape as Brand and Vocabulary in the
 * mission wizard: "Draft from what we know" proposes 1-3 offers from the
 * profile + cached ingestion text (no re-crawl), a human reviews/edits each,
 * and an explicit Confirm is what counts it toward the Brain-completeness
 * score. Everyday CRUD (create/edit) goes through the same research-skill
 * functions the Research screen always used — this page just gives offers
 * their own home instead of living inside step 1 of that screen.
 */

import { useRef, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import {
  VdfPageHeader, VdfLoader, VdfEmptyState,
  VdfButton, VdfModal, VdfBadge,
} from '@/components/vdf';
import s from './offers.module.css';

/* ── Types (mirrors backend/src/skills/research-skill/offer-catalogue.ts) ── */

type Commitment = 'entry' | 'project' | 'retainer';

interface Offer {
  id: string; name: string; one_line: string; who_for: string; problem: string;
  what_we_do: string[]; signals: string[]; disqualifiers: string[];
  price_band: string; proof: string; commitment: Commitment;
  source: 'agent' | 'human'; confirmed_at: string | null; is_ready: boolean;
}

const COMMITMENT_OPTIONS: { value: Commitment; label: string; hint: string }[] = [
  { value: 'entry', label: 'Entry', hint: 'A workshop, an audit, an assessment — something a stranger can say yes to.' },
  { value: 'project', label: 'Project', hint: 'Bounded delivery with a start and an end.' },
  { value: 'retainer', label: 'Retainer', hint: 'Ongoing. Almost never a sane first ask.' },
];

const COMMITMENT_SHORT: Record<Commitment, string> = {
  entry: 'entry ask', project: 'project', retainer: 'retainer',
};

const lines = (xs: string[]) => xs.join('\n');
const toLines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

const emptyOffer = (): Offer => ({
  id: '', name: '', one_line: '', who_for: '', problem: '',
  what_we_do: [], signals: [], disqualifiers: [], price_band: '', proof: '',
  commitment: 'project', source: 'human', confirmed_at: null, is_ready: false,
});

/**
 * A labelled textarea that GROWS to fit what is in it.
 *
 * MODULE SCOPE, deliberately — see the identical component in
 * gtm/audience/find/page.tsx for why: inside a component it becomes a new
 * type on every render and React remounts it, losing focus on every
 * keystroke.
 */
function Area({ label, value, hint, onEdit, minRows = 3 }: {
  label: string; value: string; hint?: string;
  onEdit: (v: string) => void; minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

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

/* ── Page ───────────────────────────────────────────────────────────── */

export default function OffersPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<Offer | null>(null);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const offersQ = useSkillQuery<{ offers: Offer[]; problems: string[]; ready: boolean }>(
    'research-skill', 'get_offers', {},
  );
  const saveOffer = useSkillMutation('research-skill', 'save_offer');

  const offers = offersQ.data?.data.offers ?? [];
  const problems = offersQ.data?.data.problems ?? [];

  const whoForChips = Array.from(new Set(
    offers.map((o) => o.who_for.trim()).filter(Boolean),
  ));

  const refresh = () => qc.invalidateQueries({ queryKey: ['skill', 'research-skill', 'get_offers'] });

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch<{ drafted: { offer_key: string; name: string }[] }>(
        API.gtmProfile.generateOfferDrafts,
      );
      const count = res.drafted.length;
      showToast({
        type: count > 0 ? 'success' : 'info',
        message: count > 0
          ? `Drafted ${count} offer${count === 1 ? '' : 's'} — review and confirm each below.`
          : 'Nothing came back — VaNi may not have enough evidence yet to propose an offer.',
      });
      refresh();
    } catch (err) {
      showToast({ type: 'error', message: (err as ApiError).message || 'Could not draft offers' });
    } finally {
      setGenerating(false);
    }
  };

  const savePayload = (draft: Offer) => ({
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

  const onSaveOffer = async (draft: Offer) => {
    try {
      await saveOffer.mutateAsync(savePayload(draft));
      showToast({ type: 'success', message: `Saved "${draft.name}"` });
      setEditing(null);
      refresh();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not save the offer' });
    }
  };

  // Save first — the fields the human just edited must land before
  // confirming, or "Save & confirm" would silently confirm stale content.
  const onConfirm = async (draft: Offer) => {
    setConfirming(true);
    try {
      const saved = await saveOffer.mutateAsync(savePayload(draft));
      const offerKey = ((saved.data as { offer_key?: string })?.offer_key) || draft.id;
      await apiFetch(API.gtmProfile.confirmOffer, { pathParams: { offerKey } });
      showToast({ type: 'success', message: `"${draft.name}" confirmed — counts toward your Brain score now.` });
      setEditing(null);
      refresh();
    } catch (err) {
      const message = (err as Partial<ApiError>)?.message
        || (err instanceof Error ? err.message : 'Could not confirm the offer');
      showToast({ type: 'error', message });
    } finally {
      setConfirming(false);
    }
  };

  if (offersQ.isLoading) return <VdfLoader message="Loading your offers" />;

  return (
    <div className="page">
      <VdfPageHeader
        eyebrow="BRAIN"
        title="Offers"
        meta="What you sell. Every company's website is scored against these — the signals decide who fits, the disqualifiers are the only reason anything is ever ruled out."
      />

      <div className="body">
        <div className={s.sectionHead}>
          <div className={s.sectionNote}>
            {offers.length > 0
              ? `${offers.length} offer${offers.length === 1 ? '' : 's'}, ${offers.filter((o) => o.confirmed_at).length} confirmed.`
              : 'Nothing here yet.'}
          </div>
          <div className={s.actions}>
            <VdfButton variant="outline" onClick={onGenerate} disabled={generating}>
              {generating ? 'Drafting…' : 'Draft from what we know'}
            </VdfButton>
            <VdfButton variant="primary" onClick={() => setEditing(emptyOffer())}>
              Add an offer
            </VdfButton>
          </div>
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

        {offers.length === 0 ? (
          <VdfEmptyState
            icon="◇"
            title="No offers yet"
            description="VaNi can propose offers from your profile and what it has already read — or start from a blank one."
            action={<VdfButton variant="primary" onClick={onGenerate} disabled={generating}>
              {generating ? 'Drafting…' : 'Draft from what we know'}
            </VdfButton>}
          />
        ) : (
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
                    {!o.confirmed_at && <VdfBadge variant="gold">Needs review</VdfBadge>}
                  </div>
                </div>
                <div className={s.offerLine}>{o.one_line || 'No description yet.'}</div>
              </div>
            ))}
          </div>
        )}
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
            confirming={confirming}
            whoForChips={whoForChips}
            onCancel={() => setEditing(null)}
            onSave={onSaveOffer}
            onConfirm={onConfirm}
          />
        )}
      </VdfModal>
    </div>
  );
}

/* ── Offer form ─────────────────────────────────────────────────────── */

function OfferForm({
  initial, onSave, onConfirm, onCancel, saving, confirming, whoForChips,
}: {
  initial: Offer;
  onSave: (o: Offer) => void;
  onConfirm: (o: Offer) => void;
  onCancel: () => void;
  saving: boolean;
  confirming: boolean;
  whoForChips: string[];
}) {
  const [draft, setDraft] = useState<Offer>(initial);
  const set = (patch: Partial<Offer>) => setDraft((d) => ({ ...d, ...patch }));

  const missing = [
    !draft.price_band.trim() && 'price band',
    !draft.proof.trim() && 'proof',
    draft.signals.length === 0 && 'fit signals',
    draft.disqualifiers.length === 0 && 'disqualifiers',
  ].filter(Boolean) as string[];

  const chips = whoForChips.filter((w) => w !== draft.who_for);

  return (
    <>
      <div className={s.offerForm}>
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

          <div className={s.formRow}>
            <label className={s.formLabel}>Who it is for</label>
            <textarea
              className={s.textarea} value={draft.who_for} rows={3}
              onChange={(e) => set({ who_for: e.target.value })}
            />
            {chips.length > 0 && (
              <div className={s.chipRow}>
                {chips.slice(0, 8).map((w) => (
                  <button
                    key={w} type="button" className={s.chip}
                    onClick={() => set({ who_for: w })}
                    title="Use this — from one of your other offers"
                  >
                    {w.length > 40 ? `${w.slice(0, 40)}…` : w}
                  </button>
                ))}
              </div>
            )}
          </div>

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
          {!draft.confirmed_at && draft.id && (
            <> Not yet confirmed — it earns no credit toward your Brain score until you confirm it.</>
          )}
        </div>
        <div className={s.actions}>
          <VdfButton variant="outline" onClick={onCancel}>Cancel</VdfButton>
          <VdfButton
            variant="outline" disabled={saving || !draft.name.trim()}
            onClick={() => onSave(draft)}
          >
            {saving ? 'Saving…' : 'Save'}
          </VdfButton>
          {!draft.confirmed_at && draft.id && (
            <VdfButton
              variant="primary" disabled={confirming || saving}
              onClick={() => onConfirm(draft)}
            >
              {confirming ? 'Confirming…' : 'Save & confirm'}
            </VdfButton>
          )}
        </div>
      </div>
    </>
  );
}
