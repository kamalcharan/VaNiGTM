'use client';
/** Station 7 — who gets which story. Proposed from the verdicts and the offer each brief fit best; confirm, not compose. */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import a from '@/skills/gtm-audience/audience.module.css';
import { useMotionWrites, useSegments } from '../useMotion';
import type { Segment } from '../mock';

export function SegmentStep() {
  const q = useSegments();
  const w = useMotionWrites();
  return (
    <DataBoundary query={q} label="segments" skeleton={<SkeletonRows rows={2} lines={2} />} isEmpty={(d: { segments: Segment[] } | undefined) => !d?.segments?.length} empty="No segments to propose — nobody has been marked worth a message yet.">
      {(d: { segments: Segment[] }) => (
        <div className={a.card}>
          <div className={a.eyebrow}>// PUT THEM IN MOTION · 1 OF 4</div>
          <h1 className={a.h}>{d.segments.length === 1 ? 'One group, one story' : `${d.segments.length} groups, one story each`}</h1>
          <p className={a.sub}>Proposed from your verdicts and the offer each brief fit best, named in your own vocabulary. Confirm, or split.</p>
          <div className={a.list}>
            {d.segments.map((s) => (
              <div key={s.id} className={`${a.row} ${a.rowOn}`}>
                <span className={a.tick} aria-pressed="true" style={{ cursor: 'default' }}>✓</span>
                <div>
                  <div className={a.name}>{s.name}</div>
                  <div className={a.why}>{s.people.map((p) => p.company).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ')}. {s.why} Opens with <b>{s.offer}</b>.</div>
                  <div className={a.meta}>{s.people.map((p) => <span key={p.id} className={`${a.chip} ${a.chipMine}`}>{p.contact_ref} · {p.name}</span>)}</div>
                </div>
                <span className={a.side}>{s.people.length} {s.people.length === 1 ? 'person' : 'people'}</span>
              </div>
            ))}
          </div>
          <div className={a.actions}>
            <button type="button" className={a.primary} disabled={w.busy} onClick={async () => { const r = await w.confirmSegments(); if (r) await w.advance('story'); }}>These are right — write the stories →</button>
            <span className={a.hint}>Splitting and renaming arrive with integration; today the proposal is confirmed whole.</span>
          </div>
        </div>
      )}
    </DataBoundary>
  );
}
