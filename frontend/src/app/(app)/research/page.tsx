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

import { useState, useMemo } from 'react';
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

interface Offer {
  id: string; name: string; one_line: string; who_for: string; problem: string;
  what_we_do: string[]; signals: string[]; disqualifiers: string[];
  price_band: string; proof: string; is_ready: boolean;
}

interface Evidence { claim: string; url: string; excerpt: string }

interface Brief {
  id: number; prospect_id: number; ref: string | null; name: string;
  domain: string | null; status: string; pages_read: number;
  what_they_make: string | null; scale_signals: string | null;
  service_signals: string | null; digital_maturity: string | null;
  named_contacts: { name?: string; title?: string; email?: string }[];
  fit: Record<string, { score: number; reason: string }>;
  recommended_offer: string | null; fit_reason: string | null;
  hook: string | null; raw_evidence: Evidence[]; error: string | null;
  decision_note: string | null; decided_at: string | null;
  unevidenced: boolean; updated_at: string;
}

interface Tag { id: number; label: string }

interface BatchStatus {
  verdict: 'never_run' | 'queued' | 'running' | 'worker_down' | 'failed' | 'completed' | 'unknown';
  message: string;
  healthy: boolean;
  done_count: number;
  requested: number | null;
  run_status: string | null;
  error: string | null;
}

/** Badge variants the VDF library actually has. */
const STATUS_VARIANT: Record<string, 'default' | 'gold' | 'success' | 'info'> = {
  approved: 'success', drafted: 'info', unreadable: 'gold',
  rejected: 'default', no_contact: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  drafted: 'Needs a decision', approved: 'Approved',
  unreadable: 'Site unreadable', rejected: 'Rejected', no_contact: 'Do not contact',
};

const emptyOffer = (): Offer => ({
  id: '', name: '', one_line: '', who_for: '', problem: '',
  what_we_do: [], signals: [], disqualifiers: [], price_band: '', proof: '',
  is_ready: false,
});

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

  const saveOffer = useSkillMutation('research-skill', 'save_offer');
  const startResearch = useSkillMutation('research-skill', 'start_research');
  const decide = useSkillMutation('research-skill', 'decide_brief');

  const offers = offersQ.data?.data.offers ?? [];
  const problems = offersQ.data?.data.problems ?? [];
  const ready = offersQ.data?.data.ready ?? false;
  const briefs = briefsQ.data?.data.briefs ?? [];
  const stats = briefsQ.data?.data.stats ?? {};
  const tags = (tagsQ.data?.data.facets?.tags ?? []) as Tag[];
  const batch = statusQ.data?.data;

  const offerName = useMemo(() => {
    const m = new Map(offers.map((o) => [o.id, o.name]));
    return (key: string | null) => (key ? m.get(key) ?? key : null);
  }, [offers]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['skill', 'research-skill'] });
  };

  /* ── Handlers ─────────────────────────────────────────────────────── */

  const onSaveOffer = async () => {
    if (!editing) return;
    try {
      await saveOffer.mutateAsync({
        offer_key: editing.id || undefined,
        name: editing.name,
        one_line: editing.one_line,
        who_for: editing.who_for,
        problem: editing.problem,
        what_we_do: editing.what_we_do,
        signals: editing.signals,
        disqualifiers: editing.disqualifiers,
        price_band: editing.price_band,
        proof: editing.proof,
      });
      showToast({ type: 'success', message: `Saved “${editing.name}”` });
      setEditing(null);
      refresh();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not save the offer' });
    }
  };

  const onStart = async () => {
    try {
      const res = await startResearch.mutateAsync({ tag_id: tagId || undefined, limit });
      const { queued, reachable } = (res.data ?? {}) as unknown as
        { queued: number; reachable: number };
      showToast({
        type: 'success',
        message: `Queued ${queued} of ${reachable} reachable companies. `
          + 'The worker picks it up within a few seconds — each account takes 2-4 minutes.',
      });
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
                  <VdfBadge variant={o.is_ready ? 'success' : 'gold'}>
                    {o.is_ready ? 'Ready' : 'Incomplete'}
                  </VdfBadge>
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
              disabled={!ready || !tagId || startResearch.isPending}
            >
              {startResearch.isPending ? 'Queueing…' : 'Start research'}
            </VdfButton>
            {!ready && (
              <span className={s.formHint}>Finish your offers above first.</span>
            )}
          </div>

          {batch && batch.verdict !== 'never_run' && (
            <div className={batch.healthy ? s.batchOk : s.batchBad}>
              <div className={s.batchLine}>
                <strong>
                  {batch.verdict === 'running' ? 'Running' :
                   batch.verdict === 'queued' ? 'Queued' :
                   batch.verdict === 'worker_down' ? 'Nothing is picking this up' :
                   batch.verdict === 'failed' ? 'Last batch failed' : 'Last batch finished'}
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
              <VdfStatCard value={stats.unreadable ?? 0} label="Site unreadable" accent="warning" />
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
              <option value="unreadable">Site unreadable</option>
            </select>
            <select className={s.select} value={offerFilter} onChange={(e) => setOfferFilter(e.target.value)}>
              <option value="">Any offer</option>
              {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value="none">No fit</option>
            </select>
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
                      {b.recommended_offer
                        ? <VdfBadge variant="success">{offerName(b.recommended_offer)}</VdfBadge>
                        : b.status !== 'unreadable' && <VdfBadge variant="default">No fit</VdfBadge>}
                      <VdfBadge variant={STATUS_VARIANT[b.status] ?? 'default'}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </VdfBadge>
                    </div>
                  </div>
                  {b.hook && <div className={s.briefHook}>{b.hook}</div>}
                  {b.what_they_make && <div className={s.briefMakes}>{b.what_they_make}</div>}
                  {b.status === 'unreadable' && b.error && (
                    <div className={s.briefMakes}>{b.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Offer editor ───────────────────────────────────────────── */}
      <VdfModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? editing.name : 'New offer'}
        subtitle="Everything here is read by the agent — and some of it reaches a prospect."
        width="lg"
        footer={
          <div className={s.actions}>
            <VdfButton variant="outline" onClick={() => setEditing(null)}>Cancel</VdfButton>
            <VdfButton variant="primary" onClick={onSaveOffer} disabled={saveOffer.isPending}>
              {saveOffer.isPending ? 'Saving…' : 'Save offer'}
            </VdfButton>
          </div>
        }
      >
        {editing && (
          <OfferForm offer={editing} onChange={setEditing} />
        )}
      </VdfModal>

      {/* ── Brief detail + decision ────────────────────────────────── */}
      <VdfModal
        isOpen={openBrief !== null}
        onClose={() => setOpenBrief(null)}
        title={openBrief?.name}
        subtitle={openBrief?.domain ?? undefined}
        width="lg"
        footer={openBrief && openBrief.status !== 'unreadable' ? (
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
            brief={openBrief} offers={offers} offerName={offerName}
            note={note} setNote={setNote}
            reassign={reassign} setReassign={setReassign}
          />
        )}
      </VdfModal>
    </div>
  );
}

/* ── Offer form ─────────────────────────────────────────────────────── */

function OfferForm({ offer, onChange }: { offer: Offer; onChange: (o: Offer) => void }) {
  const set = (patch: Partial<Offer>) => onChange({ ...offer, ...patch });
  const lines = (xs: string[]) => xs.join('\n');
  const toLines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

  const Area = ({ label, value, hint, onEdit, rows = 3 }: {
    label: string; value: string; hint?: string; onEdit: (v: string) => void; rows?: number;
  }) => (
    <div className={s.formRow}>
      <label className={s.formLabel}>{label}</label>
      <textarea
        className={s.textarea} value={value} rows={rows}
        onChange={(e) => onEdit(e.target.value)}
      />
      {hint && <div className={s.formHint}>{hint}</div>}
    </div>
  );

  return (
    <>
      <VdfInput
        label="Name" value={offer.name} required
        onChange={(e) => set({ name: e.target.value })}
      />
      <Area
        label="One line" value={offer.one_line} rows={2}
        onEdit={(v) => set({ one_line: v })}
        hint="How you would describe it in a sentence."
      />
      <Area
        label="Who it is for" value={offer.who_for} rows={2}
        onEdit={(v) => set({ who_for: v })}
      />
      <Area
        label="Problem it solves" value={offer.problem}
        onEdit={(v) => set({ problem: v })}
      />
      <Area
        label="What you do" value={lines(offer.what_we_do)}
        onEdit={(v) => set({ what_we_do: toLines(v) })}
        hint="One per line."
      />
      <Area
        label="Fit signals" value={lines(offer.signals)}
        onEdit={(v) => set({ signals: toLines(v) })}
        hint="One per line. What on a company's website tells you this fits them — this is what the agent looks for."
      />
      <Area
        label="Do NOT pitch this when" value={lines(offer.disqualifiers)}
        onEdit={(v) => set({ disqualifiers: toLines(v) })}
        hint="One per line. Without these the agent always finds a reason to say yes."
      />
      <Area
        label="Price band" value={offer.price_band} rows={2}
        onEdit={(v) => set({ price_band: v })}
      />
      <Area
        label="Proof" value={offer.proof} rows={2}
        onEdit={(v) => set({ proof: v })}
        hint="What you can stand behind in writing. If you have no case study yet, say what is actually true — credentials, adjacent work. Never invent one; a real prospect can check."
      />
    </>
  );
}

/* ── Brief detail ───────────────────────────────────────────────────── */

function BriefDetail({
  brief, offers, offerName, note, setNote, reassign, setReassign,
}: {
  brief: Brief; offers: Offer[]; offerName: (k: string | null) => string | null;
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

  if (brief.status === 'unreadable') {
    return (
      <>
        <div className={s.detailField}>
          <div className={s.detailLabel}>Site could not be read</div>
          <div className={s.detailValue}>{brief.error}</div>
        </div>
        <div className={s.formHint}>
          No brief was invented for this one. An invented detail in a first message is the
          one mistake that cannot be walked back.
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
          Fit — {offerName(brief.recommended_offer) ?? 'nothing fits'}
        </div>
        {brief.fit_reason && <div className={s.detailValue}>{brief.fit_reason}</div>}
        {Object.entries(brief.fit ?? {}).map(([id, f]) => (
          <div key={id} className={s.fitRow}>
            <span className={s.fitScore}>{Number(f.score).toFixed(2)}</span>
            <span className={s.fitReason}>{offerName(id)} — {f.reason}</span>
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
          <option value="">Keep {offerName(brief.recommended_offer) ?? 'as no fit'}</option>
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
