'use client';
/**
 * Station 4 — briefs, and a decision per company.
 *
 * While the batch runs, the feed shows each brief landing; the tenant does not
 * wait for the batch. Then: fit per offer, blind to the size of the ask; the
 * smallest ask that fits; every claim with where it was read. Three verdicts
 * per brief, and the verdicts teach the next batch.
 */
import { useEffect } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useAudienceWrites, useBatchStatus, useBriefs } from '../useAudience';
import { OFFERS, type BatchStatus, type Brief } from '../mock-data';
import s from '../audience.module.css';


export function QualifyStep() {
  const batch = useBatchStatus();
  const briefs = useBriefs();
  const w = useAudienceWrites();
  const batchState = batch.data?.data?.state;
  const running = batchState === 'running';

  // The briefs query was answered (empty) before the batch finished; the
  // moment the batch reports done, read them again rather than trusting the
  // stale answer.
  const refetchBriefs = briefs.refetch;
  useEffect(() => { if (batchState === 'done') void refetchBriefs(); }, [batchState, refetchBriefs]);

  if (running || (batch.isSuccess && !batch.data?.data)) {
    return (
      <DataBoundary query={batch} label="research" skeleton={<SkeletonRows rows={3} />}>
        {(b: BatchStatus | null) => (
          <div className={s.card}>
            <div className={s.eyebrow}>// BUILD THE AUDIENCE · 3 OF 4</div>
            <h1 className={s.h}>{b ? 'Reading the companies' : 'Nothing is being researched'}</h1>
            <p className={s.sub}>Their sites, then the open web, framed by your vocabulary. Each brief lands as it finishes — you do not wait for the batch. The run survives a restart; what is written stays written.</p>
            <div className={s.feed}>
              {(b?.lines ?? []).map((l, i) => <div key={i} className={s.fline}><span className={s.fAt}>{l.at}</span><span className={l.done ? s.fDone : ''}>{l.text}</span></div>)}
            </div>
            {b && <p className={s.note}>Budget: {b.budget_used} of {b.budget_total} today. One model call at a time on the platform.</p>}
          </div>
        )}
      </DataBoundary>
    );
  }

  return (
    <DataBoundary query={briefs} label="briefs" skeleton={<SkeletonRows rows={4} lines={3} />}
      isEmpty={(d: { briefs: Brief[] } | undefined) => !d?.briefs?.length}
      empty="No briefs yet. Pick the companies to research first — Find is one step back.">
      {(d: { briefs: Brief[] }) => {
        const worth = d.briefs.filter((b) => b.verdict === 'yes').length;
        const decided = d.briefs.filter((b) => b.verdict).length;
        return (
          <div className={s.card}>
            <div className={s.eyebrow}>// BUILD THE AUDIENCE · 3 OF 4</div>
            <h1 className={s.h}>{d.briefs.length} briefs. Who is worth a message?</h1>
            <p className={s.sub}>Fit is scored per offer, blind to how big the ask is — then GTM opens with the smallest ask among the offers that fit. Every claim carries where it was read. Decide per row; your verdicts teach the next batch.</p>
            {d.briefs.map((b) => {
              const scored = Object.keys(b.fit).length > 0;
              const best = scored ? Object.entries(b.fit).sort((a, c) => c[1] - a[1])[0]?.[0] : null;
              const open = OFFERS.find((o) => o.id === b.open_with);
              return (
                <div key={b.prospect_id} className={s.brief}>
                  <div className={s.briefHead}>
                    <div>
                      <div className={s.name}>{b.name}<small>{[b.ref, b.city, b.size_label].filter(Boolean).join(' · ')}</small></div>
                      <div className={s.meta}>
                        <span className={`${s.chip} ${b.source_label.toLowerCase().startsWith('pool') ? s.chipPool : s.chipMine}`}>{b.source_label || 'your list'}</span>
                        {b.preview_placeholder && <span className={`${s.chip} ${s.chipWarn}`}>preview · research not wired</span>}
                      </div>
                    </div>
                    <div className={s.seg}>
                      <button type="button" aria-pressed={b.verdict === 'yes'} onClick={() => void w.decide(b.prospect_id, 'yes')} disabled={w.busy}>Worth a message</button>
                      <button type="button" className="later" aria-pressed={b.verdict === 'later'} onClick={() => void w.decide(b.prospect_id, 'later')} disabled={w.busy}>Later</button>
                      <button type="button" className="bad" aria-pressed={b.verdict === 'no'} onClick={() => void w.decide(b.prospect_id, 'no')} disabled={w.busy}>Not this one</button>
                    </div>
                  </div>
                  {scored && (
                    <div className={s.fit}>
                      {OFFERS.map((o) => (
                        <div key={o.id} className={`${s.fitc} ${o.id === best ? s.fitBest : ''}`}><div className={s.fitK}>{o.name} · {o.ask}</div><div className={s.fitV}>{b.fit[o.id]}%</div></div>
                      ))}
                      <div className={s.fitc}><div className={s.fitK}>Open with</div><div className={s.fitOpen}>{open?.name} — the {open?.ask} ask</div></div>
                    </div>
                  )}
                  <div className={s.subh}>Evidence · {b.evidence.length} {b.evidence.length === 1 ? 'claim' : 'claims'}</div>
                  <div className={s.ev}>{b.evidence.map((e, i) => <div key={i} className={s.evl}>{e.claim}<span className={s.evSrc}>{e.source}</span>{e.excerpt && <span className={s.evQ}>{e.excerpt}</span>}</div>)}</div>
                </div>
              );
            })}
            <div className={s.actions}>
              <button type="button" className={s.primary} disabled={!worth || w.busy} onClick={() => void w.advance('people')}>
                {worth ? `Find people at ${worth} →` : 'Mark at least one worth a message'}
              </button>
              <span className={s.hint}>{decided} of {d.briefs.length} decided</span>
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}
