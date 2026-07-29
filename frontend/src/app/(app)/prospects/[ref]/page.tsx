'use client';

/**
 * The prospect dossier — one company, on a page of its own.
 *
 * ── WHY A PAGE AND NOT A MODAL (design-notes-research.md R5) ──────────
 *
 * The decision this screen exists for is "is this company worth writing to,
 * and about what". Making it well means holding four things at once: what
 * they make, what the agent concluded, the evidence under that conclusion,
 * and the people you could reach. A modal can show any one of those; it
 * cannot show them together, and a judgement made by scrolling inside a box
 * is a judgement made on a quarter of the information at a time.
 *
 * It is also addressable. `/prospects/PROS-0042` can be sent to someone —
 * which the modal, being a piece of transient state on a list, never could.
 * The URL carries `ref`, never the raw PK (CLAUDE.md).
 *
 * ── ORDER IS THE ARGUMENT ─────────────────────────────────────────────
 *
 * Facts before judgement, judgement before evidence, decision last. That is
 * the order someone has to think in to be able to disagree with the agent,
 * and putting the recommendation first would make everything after it read
 * as justification.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  VdfPageHeader, VdfLoader, VdfButton, VdfBadge, VdfEmptyState,
} from '@/components/vdf';
import s from './dossier.module.css';

/* ── Types ──────────────────────────────────────────────────────────── */

interface Prospect {
  id: number; ref: string | null; name: string;
  domain_normalized: string | null; website: string | null;
  email: string | null; phone: string | null;
  address_line: string | null; city: string | null; state_code: string | null;
  country: string | null; industry_raw: string | null;
  industry_canonical: string | null; industry_sub: string | null;
  employees_band: string | null; revenue_band: string | null;
  linkedin_url: string | null; year_founded: number | null;
  description: string | null; relationship: string | null;
  completeness: string | null; validity: string | null;
  source_as_of: string | null; load_label: string | null;
}

interface Person {
  id: number; name: string | null; job_title: string | null;
  linkedin_url: string | null; location: string | null;
  channels: { type: string; value: string }[];
}

interface Brief {
  id: number; status: string; domain: string | null;
  pages_read: number; site_health: string | null;
  what_they_make: string | null; scale_signals: string | null;
  service_signals: string | null; digital_maturity: string | null;
  certifications: string[] | null;
  named_contacts: { name?: string; title?: string; email?: string }[];
  fit: Record<string, { score: number; reason: string }>;
  recommended_offer: string | null;
  best_fit_offer: string | null;
  human_offer: string | null;
  fit_margin: string | number | null;
  fit_reason: string | null; hook: string | null;
  raw_evidence: {
    claim: string; url: string; excerpt: string;
    /** 'website' = their own site · 'search' = a third party. */
    source?: 'website' | 'search';
  }[];
  error: string | null; unevidenced: boolean;
  decision_note: string | null; decided_at: string | null;
  facts_at: string | null; judged_at: string | null; updated_at: string;
}

interface OfferRef { offer_key: string; name: string; commitment: string }

interface Touch {
  id: number; offer: string | null; channel: string;
  touched_at: string; outcome: string | null; outcome_at: string | null;
  notes: string | null; had_brief: boolean; is_pending: boolean;
}

const CHANNELS = ['email', 'phone', 'linkedin', 'whatsapp', 'other'] as const;

/** `not_interested` is a REPLY — the thesis is that research earns a
 *  response, not that it wins deals. `bounced` never reached them. */
const OUTCOMES: { value: string; label: string }[] = [
  { value: '', label: 'No response yet' },
  { value: 'replied', label: 'Replied' },
  { value: 'meeting', label: 'Meeting agreed' },
  { value: 'not_interested', label: 'Not interested (still a reply)' },
  { value: 'bounced', label: 'Bounced — never reached them' },
  { value: 'no_response', label: 'No response' },
];
interface TagRef { id: number; label: string; inherited: boolean }

const STATUS_LABEL: Record<string, string> = {
  drafted: 'Needs a decision', approved: 'Approved',
  unreadable: 'No usable website',
  extract_failed: 'Our extraction failed — retryable',
  rejected: 'Rejected', no_contact: 'Do not contact',
};

const STATUS_VARIANT: Record<string, 'default' | 'gold' | 'success' | 'info'> = {
  approved: 'success', drafted: 'info', unreadable: 'gold',
  extract_failed: 'gold', rejected: 'default', no_contact: 'default',
};

/** Mirrors FIT_MARGIN in backend offer-catalogue.ts — change both together. */
const FIT_MARGIN = 0.15;

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pct = (v: string | null) =>
  v === null ? '—' : `${Math.round(Number(v) * 100)}%`;

/* ── Page ───────────────────────────────────────────────────────────── */

export default function DossierPage() {
  const params = useParams<{ ref: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [note, setNote] = useState('');
  const [reassign, setReassign] = useState('');
  const [channel, setChannel] = useState<string>('email');
  const [touchNote, setTouchNote] = useState('');

  const q = useSkillQuery<{
    prospect: Prospect; people: Person[]; tags: TagRef[];
    brief: Brief | null; offers: OfferRef[];
    source_row: Record<string, unknown>;
  }>('prospect-skill', 'get_prospect', { ref: decodeURIComponent(params.ref) });

  const decide = useSkillMutation('research-skill', 'decide_brief');
  const startResearch = useSkillMutation('research-skill', 'start_research');
  const logTouch = useSkillMutation('research-skill', 'log_touch');
  const setOutcome = useSkillMutation('research-skill', 'set_touch_outcome');

  const touchesQ = useSkillQuery<{ touches: Touch[] }>(
    'research-skill', 'get_touches',
    { prospect_id: q.data?.data?.prospect?.id },
    { enabled: Boolean(q.data?.data?.prospect?.id) },
  );

  const d = q.data?.data;
  const p = d?.prospect;
  const brief = d?.brief ?? null;
  const offers = d?.offers ?? [];

  const offerName = (key: string | null): string | null =>
    key ? (offers.find((o) => o.offer_key === key)?.name ?? key) : null;
  const commitmentOf = (key: string | null): string | null =>
    key ? (offers.find((o) => o.offer_key === key)?.commitment ?? null) : null;

  const effective = brief?.human_offer ?? brief?.recommended_offer ?? null;

  const onDecide = async (decision: 'approved' | 'rejected' | 'no_contact') => {
    if (!brief) return;
    try {
      await decide.mutateAsync({
        brief_id: brief.id, decision,
        offer_key: reassign || undefined,
        note: note || undefined,
      });
      showToast({
        type: 'success',
        message: decision === 'approved'
          ? 'Approved — ready to write to'
          : 'Ruled out, with your reason recorded',
      });
      setNote(''); setReassign('');
      qc.invalidateQueries({ queryKey: ['skill'] });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not record that' });
    }
  };

  const onResearch = async () => {
    if (!p) return;
    try {
      await startResearch.mutateAsync({ prospect_ids: [p.id], limit: 1, refresh: true });
      showToast({
        type: 'success',
        message: 'Queued. The worker picks it up within a few seconds — this takes 2-4 minutes.',
      });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not queue it' });
    }
  };

  const onLogTouch = async () => {
    if (!p) return;
    try {
      const res = await logTouch.mutateAsync({
        prospect_id: p.id, channel,
        offer: effective ?? undefined,
        notes: touchNote || undefined,
      });
      const { message } = (res.data ?? {}) as unknown as { message: string };
      showToast({ type: 'success', message });
      setTouchNote('');
      qc.invalidateQueries({ queryKey: ['skill', 'research-skill'] });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not log that' });
    }
  };

  const onSetOutcome = async (touchId: number, outcome: string) => {
    try {
      await setOutcome.mutateAsync({ touch_id: touchId, outcome: outcome || null });
      qc.invalidateQueries({ queryKey: ['skill', 'research-skill'] });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not record that' });
    }
  };

  if (q.isLoading) return <VdfLoader message="Loading the company" />;
  if (q.isError || !p) {
    return (
      <div className="page">
        <VdfPageHeader eyebrow="GTM RECORDS" title="Not found" />
        <div className="body">
          <VdfEmptyState
            title="No such company"
            description={q.error instanceof Error ? q.error.message : 'That reference does not match a company in this environment.'}
          />
          <VdfButton variant="outline" onClick={() => router.push('/prospects')}>
            Back to prospects
          </VdfButton>
        </div>
      </div>
    );
  }

  const decidable = brief
    && brief.status !== 'unreadable' && brief.status !== 'extract_failed';

  return (
    <div className="page">
      <VdfPageHeader
        eyebrow={p.ref ?? 'PROSPECT'}
        title={p.name}
        meta={[p.city, p.state_code, p.industry_sub ?? p.industry_canonical]
          .filter(Boolean).join(' · ')}
      />

      <div className="body">
        <button className={s.back} onClick={() => router.push('/prospects')}>
          ← All prospects
        </button>

        <div className={s.grid}>
          {/* ── Left: what we know about them ─────────────────────── */}
          <div className={s.main}>
            {/* 1. THE FACTS. Before any judgement, deliberately — putting the
                   recommendation first makes everything after it read as
                   justification for a conclusion already reached. */}
            <section className={s.card}>
              <h2 className={s.cardTitle}>What they do</h2>
              {brief?.what_they_make ? (
                <>
                  <Field label="What they make" value={brief.what_they_make} />
                  <Field label="Scale" value={brief.scale_signals} />
                  <Field label="Service / AMC" value={brief.service_signals} />
                  <Field label="Digital maturity" value={brief.digital_maturity} />
                  {(brief.certifications ?? []).length > 0 && (
                    <Field label="Certifications" value={(brief.certifications ?? []).join(' · ')} />
                  )}
                  <div className={s.meta}>
                    Read from {brief.pages_read} page{brief.pages_read === 1 ? '' : 's'} of{' '}
                    {brief.domain}
                    {brief.facts_at && <> · {formatDateTime(brief.facts_at)}</>}
                  </div>
                </>
              ) : (
                <>
                  <Field label="Industry as filed" value={p.industry_raw} />
                  <div className={s.emptyNote}>
                    {brief
                      ? brief.error ?? 'Nothing could be read from their website.'
                      : 'Not researched yet — nothing here comes from their own site.'}
                  </div>
                  <VdfButton
                    variant="outline" onClick={onResearch}
                    disabled={!p.domain_normalized || startResearch.isPending}
                  >
                    {!p.domain_normalized ? 'No website to read'
                      : startResearch.isPending ? 'Queueing…' : 'Research this company'}
                  </VdfButton>
                </>
              )}
            </section>

            {/* 2. THE JUDGEMENT */}
            {brief && brief.facts_at && (
              <section className={s.card}>
                <h2 className={s.cardTitle}>
                  Fit — {offerName(effective) ?? 'nothing fits'}
                </h2>

                {brief.hook && <div className={s.hook}>{brief.hook}</div>}

                {brief.human_offer && brief.human_offer !== brief.recommended_offer && (
                  <div className={s.ladder}>
                    You moved this from <strong>{offerName(brief.recommended_offer) ?? 'no fit'}</strong>
                    {' '}to <strong>{offerName(brief.human_offer)}</strong>. The agent&rsquo;s
                    proposal is kept so the difference can be learned from.
                  </div>
                )}

                {brief.best_fit_offer && brief.best_fit_offer !== brief.recommended_offer && (
                  <div className={s.ladder}>
                    The model scored <strong>{offerName(brief.best_fit_offer)}</strong> highest
                    {commitmentOf(brief.best_fit_offer) && ` (${commitmentOf(brief.best_fit_offer)})`}.
                    {' '}Opening with <strong>{offerName(brief.recommended_offer)}</strong> instead:
                    it scores inside {FIT_MARGIN.toFixed(2)} of the top and is a far smaller
                    thing to say yes to.
                  </div>
                )}

                {num(brief.fit_margin) !== null && brief.recommended_offer
                  && num(brief.fit_margin)! < FIT_MARGIN && (
                  <div className={s.unclear}>
                    Top two offers are {num(brief.fit_margin)!.toFixed(2)} apart — inside the
                    noise of the model&rsquo;s own judgement. Treat them as tied, not ranked.
                  </div>
                )}

                {brief.fit_reason && <div className={s.value}>{brief.fit_reason}</div>}

                <div className={s.fitTable}>
                  {Object.entries(brief.fit ?? {})
                    .sort((a, b) => b[1].score - a[1].score)
                    .map(([id, f]) => (
                      <div key={id} className={s.fitRow}>
                        <span className={s.fitScore}>{Number(f.score).toFixed(2)}</span>
                        <span className={s.fitName}>{offerName(id)}</span>
                        <span className={s.fitReason}>{f.reason}</span>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* 3. THE EVIDENCE. Under the judgement, because that is where
                   someone goes when they want to disagree with it. */}
            {brief && brief.facts_at && (
              <section className={s.card}>
                <h2 className={s.cardTitle}>
                  Evidence — {brief.raw_evidence?.length ?? 0} claim(s) found on pages we read
                </h2>
                {(brief.raw_evidence ?? []).map((e, i) => (
                  <div key={i} className={s.evidence}>
                    <div className={s.evidenceClaim}>
                      {e.claim}
                      {/* A company's own homepage saying "leading manufacturer"
                          is marketing; a trade journal saying it is reporting.
                          The tier has to be readable at a glance or more
                          sources just make briefs longer. */}
                      {e.source === 'search' && (
                        <> <VdfBadge variant="default">third party</VdfBadge></>
                      )}
                    </div>
                    <a className={s.evidenceUrl} href={e.url} target="_blank" rel="noreferrer">
                      {e.url}
                    </a>
                    <div className={s.evidenceExcerpt}>&ldquo;{e.excerpt}&rdquo;</div>
                  </div>
                ))}
                {brief.unevidenced && (
                  <div className={s.unclear}>
                    Nothing here could be verified against the pages read. Treat every claim
                    above as unconfirmed — do not put any of it in a message.
                  </div>
                )}
              </section>
            )}

            {/* 4. THE DECISION, last. */}
            {decidable && (
              <section className={s.card}>
                <h2 className={s.cardTitle}>Your decision</h2>

                <div className={s.formRow}>
                  <label className={s.label}>Approve with a different offer</label>
                  <select className={s.select} value={reassign}
                    onChange={(e) => setReassign(e.target.value)}>
                    <option value="">Keep {offerName(effective) ?? 'as no fit'}</option>
                    {offers.map((o) => (
                      <option key={o.offer_key} value={o.offer_key}>{o.name}</option>
                    ))}
                  </select>
                </div>

                <div className={s.formRow}>
                  <label className={s.label}>Why (required to rule a company out)</label>
                  <textarea
                    className={s.textarea} value={note} rows={3}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Too small · wrong segment · no real problem here · site says nothing useful"
                  />
                  <div className={s.hint}>
                    Your reasons are what the agent learns from — they become the rules it
                    proposes on the Research screen.
                  </div>
                </div>

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

                {brief?.decided_at && (
                  <div className={s.meta}>
                    Last decided {formatDateTime(brief.decided_at)}
                    {brief.decision_note ? ` — “${brief.decision_note}”` : ''}
                  </div>
                )}
              </section>
            )}
            {/* 5. WHAT WAS ACTUALLY SENT, and what came back. Below the
                   decision because that is the order it happens in, and on
                   this page because the person who approved a company is the
                   person who writes to it. */}
            {brief?.decided_at && (
              <section className={s.card}>
                <h2 className={s.cardTitle}>Touches</h2>

                {(touchesQ.data?.data.touches ?? []).map((t) => (
                  <div key={t.id} className={s.touch}>
                    <div className={s.touchHead}>
                      <span className={s.touchWhen}>
                        {formatDate(t.touched_at)} · {t.channel}
                        {t.offer && <> · {offerName(t.offer)}</>}
                      </span>
                      {t.is_pending && (
                        <VdfBadge variant="info">inside the response window</VdfBadge>
                      )}
                      {!t.had_brief && (
                        <VdfBadge variant="default">unresearched</VdfBadge>
                      )}
                    </div>
                    <select
                      className={s.select}
                      value={t.outcome ?? ''}
                      onChange={(e) => onSetOutcome(t.id, e.target.value)}
                      disabled={setOutcome.isPending}
                    >
                      {OUTCOMES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {t.notes && <div className={s.hint}>{t.notes}</div>}
                  </div>
                ))}

                <div className={s.formRow}>
                  <label className={s.label}>Log a touch</label>
                  <select
                    className={s.select} value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                  >
                    {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <textarea
                    className={s.textarea} value={touchNote} rows={2}
                    onChange={(e) => setTouchNote(e.target.value)}
                    placeholder="What you actually said, or anything worth remembering"
                  />
                  <div className={s.hint}>
                    Manual on purpose. The pilot tests whether the brief enables a good
                    message, not whether a model can write one — so you write and send,
                    and this is the record that it happened.
                  </div>
                </div>

                <VdfButton
                  variant="outline" onClick={onLogTouch} disabled={logTouch.isPending}
                >
                  {logTouch.isPending ? 'Logging…' : 'I contacted them'}
                </VdfButton>
              </section>
            )}
          </div>

          <aside className={s.side}>
            <section className={s.card}>
              <div className={s.badges}>
                {brief && (
                  <VdfBadge variant={STATUS_VARIANT[brief.status] ?? 'default'}>
                    {STATUS_LABEL[brief.status] ?? brief.status}
                  </VdfBadge>
                )}
                {!brief && <VdfBadge variant="default">Not researched</VdfBadge>}
                {p.relationship && <VdfBadge variant="info">{p.relationship}</VdfBadge>}
              </div>

              <Field label="Website" value={p.website ?? p.domain_normalized} link />
              <Field label="Email" value={p.email} />
              <Field label="Phone" value={p.phone} />
              <Field label="Address" value={[p.address_line, p.city, p.state_code, p.country]
                .filter(Boolean).join(', ') || null} />
              <Field label="LinkedIn" value={p.linkedin_url} link />
              <Field label="Employees" value={p.employees_band} />
              <Field label="Revenue" value={p.revenue_band} />
              <Field label="Founded" value={p.year_founded ? String(p.year_founded) : null} />
              <Field label="Industry as filed" value={p.industry_raw} />
              <Field label="Segment" value={p.industry_sub ?? p.industry_canonical} />
            </section>

            <section className={s.card}>
              <h2 className={s.cardTitle}>People</h2>
              {(d?.people ?? []).length === 0 && !(brief?.named_contacts ?? []).length && (
                <div className={s.emptyNote}>Nobody recorded at this company yet.</div>
              )}
              {(d?.people ?? []).map((person) => (
                <div key={person.id} className={s.person}>
                  <div className={s.personName}>{person.name ?? 'Unnamed'}</div>
                  {person.job_title && <div className={s.personRole}>{person.job_title}</div>}
                  {person.channels.map((c, i) => (
                    <div key={i} className={s.personChannel}>{c.type}: {c.value}</div>
                  ))}
                </div>
              ))}
              {/* Found by the crawl, NOT imported — kept visually separate so
                  nobody treats an agent-read name as a verified contact. */}
              {(brief?.named_contacts ?? []).length > 0 && (
                <>
                  <div className={s.label}>Named on their website</div>
                  {(brief?.named_contacts ?? []).map((c, i) => (
                    <div key={i} className={s.personChannel}>
                      {[c.name, c.title, c.email].filter(Boolean).join(' · ')}
                    </div>
                  ))}
                  <div className={s.hint}>
                    Read off their site by the agent — not verified, and not imported as
                    contacts.
                  </div>
                </>
              )}
            </section>

            <section className={s.card}>
              <h2 className={s.cardTitle}>Record</h2>
              <Field label="Completeness" value={pct(p.completeness)} />
              <Field label="Validity" value={pct(p.validity)} />
              <Field label="Data as of" value={p.source_as_of ? formatDate(p.source_as_of) : 'Not stated'} />
              <Field label="Delivery" value={p.load_label} />
              <div className={s.badges}>
                {(d?.tags ?? []).map((t) => (
                  <VdfBadge key={t.id} variant={t.inherited ? 'default' : 'info'}>{t.label}</VdfBadge>
                ))}
              </div>
              {brief?.facts_at && (
                <VdfButton
                  variant="ghost" onClick={onResearch} disabled={startResearch.isPending}
                >
                  {startResearch.isPending ? 'Queueing…' : 'Research again'}
                </VdfButton>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────── */

function Field({ label, value, link }: {
  label: string; value: string | null | undefined; link?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={s.field}>
      <div className={s.label}>{label}</div>
      {link ? (
        <a
          className={s.link}
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank" rel="noreferrer"
        >
          {value}
        </a>
      ) : (
        <div className={s.value}>{value}</div>
      )}
    </div>
  );
}
