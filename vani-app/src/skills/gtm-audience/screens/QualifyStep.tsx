'use client';
/**
 * Station 4 — briefs, and a decision per company.
 *
 * While the batch runs, the status line says what the worker is doing — or
 * that nothing is picking the queue up, which is the sentence rule 12 exists
 * for. Then: fit per offer, blind to the size of the ask; the offer GTM opens
 * with (the smallest ask among the offers that fit); every claim with the
 * page it was read on. Three rulings per brief, exactly the server's:
 * approved · rejected · no_contact — and ruling a company out requires a
 * reason, because those reasons are what the next batch learns from.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useSkillQuery } from '@/lib/useSkill';
import { useAudienceWrites, useBatchStatus, useBriefs } from '../useAudience';
import type { BatchStatus, Brief, BriefList, Decision } from '../mock-data';
import s from '../audience.module.css';

interface OfferRow { id: string; name: string; commitment?: string | null; price_band?: string | null; }

const FAILED = new Set(['unreadable', 'extract_failed']);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function Verdict({ b, onDecide, busy }: { b: Brief; onDecide: (d: Decision, note?: string) => void; busy: boolean }) {
  const [asking, setAsking] = useState<Exclude<Decision, 'approved'> | null>(null);
  const [note, setNote] = useState('');
  const decided = ['approved', 'rejected', 'no_contact'].includes(b.status);
  if (asking) {
    return (
      <div className={s.reason}>
        <input className={s.reasonIn} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={asking === 'no_contact' ? 'Why must nobody here be contacted?' : 'Why not this one? (wrong size, wrong offer, could not see enough…)'} disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter' && note.trim().length >= 3) { onDecide(asking, note.trim()); setAsking(null); setNote(''); } if (e.key === 'Escape') setAsking(null); }} />
        <button type="button" className={s.quiet} disabled={busy || note.trim().length < 3} onClick={() => { onDecide(asking, note.trim()); setAsking(null); setNote(''); }}>Save</button>
        <button type="button" className={s.quiet} disabled={busy} onClick={() => setAsking(null)}>Cancel</button>
      </div>
    );
  }
  return (
    <div className={s.seg}>
      <button type="button" aria-pressed={b.status === 'approved'} onClick={() => onDecide('approved')} disabled={busy || FAILED.has(b.status)}>Worth a message</button>
      <button type="button" className="bad" aria-pressed={b.status === 'rejected'} onClick={() => setAsking('rejected')} disabled={busy}>Not this one</button>
      <button type="button" className="bad" aria-pressed={b.status === 'no_contact'} onClick={() => setAsking('no_contact')} disabled={busy} title="Nobody at this company may be contacted — a stronger ruling than 'not this one'.">Do not contact</button>
      {decided && b.decision_note && <span className={s.side} style={{ alignSelf: 'center', padding: '0 10px' }} title={b.decision_note}>“{b.decision_note.length > 40 ? `${b.decision_note.slice(0, 40)}…` : b.decision_note}”</span>}
    </div>
  );
}

function Batch({ b }: { b: BatchStatus }) {
  const bad = !b.healthy;
  const n = b.requested ?? null;
  return (
    <div className={`${s.batch} ${bad ? s.batchBad : ''}`}>
      <div className={s.batchHead}>
        <span className={`${s.chip} ${bad ? s.chipBad : b.verdict === 'completed' ? s.chipMine : s.chipPool}`}>{b.verdict.replace('_', ' ')}</span>
        {n != null && <span className={s.hint}>{b.done_count ?? 0} of {n} briefs written</span>}
      </div>
      <p className={s.why} style={{ marginTop: 6 }}>{b.message}</p>
      {b.error && <p className={s.why} style={{ color: 'var(--color-danger)' }}>{String(b.error)}</p>}
    </div>
  );
}

export function QualifyStep() {
  const batch = useBatchStatus();
  const briefs = useBriefs();
  const offers = useSkillQuery<{ offers: OfferRow[] }>('research-skill', 'get_offers');
  const w = useAudienceWrites();
  const verdict = batch.data?.data?.verdict;
  const inFlight = verdict === 'queued' || verdict === 'running';

  // Briefs land one at a time while the batch runs; re-read them each time
  // the status ticks, and once more when it finishes.
  const refetchBriefs = briefs.refetch;
  useEffect(() => { if (verdict) void refetchBriefs(); }, [verdict, batch.dataUpdatedAt, refetchBriefs]);

  const offerName = (id: string | null | undefined) => (id ? offers.data?.data?.offers.find((o) => o.id === id)?.name ?? id : '');
  const offerAsk = (id: string | null | undefined) => (id ? offers.data?.data?.offers.find((o) => o.id === id)?.commitment ?? null : null);

  return (
    <div className={s.card}>
      <div className={s.eyebrow}>// BUILD THE AUDIENCE · 3 OF 4</div>
      <DataBoundary query={batch} label="the research batch" skeleton={<SkeletonRows rows={1} />}>
        {(b: BatchStatus) => (b.verdict === 'never_run' ? <span /> : <Batch b={b} />)}
      </DataBoundary>
      <DataBoundary query={briefs} label="briefs" skeleton={<SkeletonRows rows={4} lines={3} />}
        isEmpty={(d: BriefList | undefined) => !d?.briefs?.length}
        empty={inFlight ? 'Reading the first company — its brief lands here the moment it is written. You do not have to wait on this screen.' : 'No briefs yet. Pick the companies to research first — Find is one step back.'}>
        {(d: BriefList) => {
          const worth = d.briefs.filter((b) => b.status === 'approved').length;
          const decided = d.briefs.filter((b) => b.decided_at).length;
          return (
            <>
              <h1 className={s.h}>{d.briefs.length} {d.briefs.length === 1 ? 'brief' : 'briefs'}. Who is worth a message?</h1>
              <p className={s.sub}>Fit is scored per offer, blind to how big the ask is — then GTM opens with the smallest ask among the offers that fit. Every claim carries the page it was read on. Decide per row; your verdicts teach the next batch.</p>
              {d.briefs.map((b) => {
                const fit = Object.entries(b.fit ?? {}).sort((x, y) => y[1].score - x[1].score);
                const failed = FAILED.has(b.status);
                return (
                  <div key={String(b.id)} className={s.brief}>
                    <div className={s.briefHead}>
                      <div>
                        <div className={s.name}><Link href={`/agents/gtm/companies/${encodeURIComponent(b.ref)}`} style={{ color: 'inherit', textDecoration: 'none' }}>{b.name}</Link><small>{[b.ref, b.domain].filter(Boolean).join(' · ')}</small></div>
                        <div className={s.meta}>
                          {failed ? <span className={`${s.chip} ${s.chipBad}`}>{b.status === 'unreadable' ? 'site unreadable' : 'our extraction failed'}</span>
                            : b.effective_offer ? <span className={`${s.chip} ${s.chipMine}`}>open with · {offerName(b.effective_offer)}</span>
                            : <span className={`${s.chip} ${s.chipWarn}`}>no offer fits</span>}
                          {b.unevidenced && <span className={`${s.chip} ${s.chipWarn}`} title="The model asserted things it could not point at on a page we read.">unevidenced</span>}
                          {b.human_offer && b.human_offer !== b.recommended_offer && <span className={s.chip}>moved by you</span>}
                          {b.pages_read != null && <span>{b.pages_read} pages read</span>}
                        </div>
                      </div>
                      <Verdict b={b} busy={w.busy} onDecide={(dec, note) => void w.decide(b.id, dec, note)} />
                    </div>
                    {failed ? (
                      <p className={s.why} style={{ marginTop: 10 }}>{b.error || 'No reason recorded.'} {b.status === 'extract_failed' ? 'That is our failure, not theirs — re-run it from Find.' : 'Nothing was guessed. Paste what you know about them, or leave them out.'}</p>
                    ) : (
                      <>
                        {b.what_they_make && <p className={s.why} style={{ marginTop: 10 }}>{b.what_they_make}</p>}
                        {fit.length > 0 && (
                          <div className={s.fit}>
                            {fit.map(([id, f]) => (
                              <div key={id} className={`${s.fitc} ${id === b.best_fit_offer ? s.fitBest : ''}`} title={f.reason}>
                                <div className={s.fitK}>{offerName(id)}{offerAsk(id) ? ` · ${offerAsk(id)}` : ''}</div>
                                <div className={s.fitV}>{pct(f.score)}</div>
                              </div>
                            ))}
                            {b.effective_offer && (
                              <div className={s.fitc}><div className={s.fitK}>Open with</div><div className={s.fitOpen}>{offerName(b.effective_offer)}{b.best_fit_offer && b.best_fit_offer !== b.effective_offer ? ` — smaller ask than the best fit` : ''}</div></div>
                            )}
                          </div>
                        )}
                        {b.fit_reason && <p className={s.note} style={{ marginTop: 8 }}>{b.fit_reason}</p>}
                        {b.hook && <p className={s.hook}>“{b.hook}”</p>}
                        <div className={s.subh}>Evidence · {b.raw_evidence?.length ?? 0} {(b.raw_evidence?.length ?? 0) === 1 ? 'claim' : 'claims'}</div>
                        {b.raw_evidence?.length ? (
                          <div className={s.ev}>{b.raw_evidence.map((e, i) => <div key={i} className={s.evl}>{e.claim}<a className={s.evSrc} href={e.url} target="_blank" rel="noreferrer noopener">{e.url}</a>{e.excerpt && <span className={s.evQ}>{e.excerpt}</span>}</div>)}</div>
                        ) : <p className={s.why}>Nothing the model could point at. Read this one yourself before deciding.</p>}
                      </>
                    )}
                  </div>
                );
              })}
              <div className={s.actions}>
                <button type="button" className={s.primary} disabled={!worth || w.busy} onClick={() => void w.advance('people')}>
                  {worth ? `Find people at ${worth} →` : 'Mark at least one worth a message'}
                </button>
                <span className={s.hint}>{decided} of {d.briefs.length} decided{inFlight ? ' · more briefs on the way' : ''}</span>
              </div>
            </>
          );
        }}
      </DataBoundary>
    </div>
  );
}
