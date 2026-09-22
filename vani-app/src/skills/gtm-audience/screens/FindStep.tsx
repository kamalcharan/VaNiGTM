'use client';
/**
 * Station 3 — which of these are worth researching.
 *
 * Research costs a budget, so this is a decision, not a default. Rows in
 * range with a domain are pre-ticked; the weak ones are pre-unticked and say
 * why; a row with no domain cannot be ticked at all and says that.
 */
import { useEffect, useState } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useAudienceWrites, useHotList } from '../useAudience';
import { BUDGET_PER_BRIEF, BUDGET_TOTAL, type HotList } from '../mock-data';
import { RowCard } from './BringStep';
import s from '../audience.module.css';

export function FindStep() {
  const q = useHotList();
  const w = useAudienceWrites();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const rows = q.data?.data?.rows;

  // Seed the selection once from the agent's own judgement: in range, with a
  // domain, not weak. The tenant edits from there rather than from nothing.
  useEffect(() => {
    if (rows && picked === null) setPicked(new Set(rows.filter((r) => r.has_domain && !r.weak).map((r) => r.id)));
  }, [rows, picked]);

  const n = picked?.size ?? 0;
  const cost = n * BUDGET_PER_BRIEF;

  return (
    <DataBoundary query={q} label="companies" skeleton={<SkeletonRows rows={5} lines={2} />}>
      {(d: HotList) => (
        <div className={s.card}>
          <div className={s.eyebrow}>// BUILD THE AUDIENCE · 2 OF 4</div>
          <h1 className={s.h}>Which of these are worth researching?</h1>
          <p className={s.sub}>Research costs a budget, so this is a decision, not a default. Every row says what is already known; untick the obvious misses. The ones below your range are pre-unticked and say why.</p>
          <div className={s.list}>
            {d.rows.map((r) => {
              const on = !!picked?.has(r.id);
              return (
                <RowCard key={r.id} r={r} on={on} off={!on && (r.weak || !r.has_domain)}
                  onTick={() => setPicked((p) => { const nx = new Set(p ?? []); if (nx.has(r.id)) nx.delete(r.id); else nx.add(r.id); return nx; })}>
                  <span className={s.side}>{!r.has_domain ? 'no domain' : on ? 'research' : 'skip'}</span>
                </RowCard>
              );
            })}
          </div>
          <div className={s.actions}>
            <button type="button" className={s.primary} disabled={!n || w.busy}
              onClick={async () => { const ids = [...(picked ?? [])]; const r = await w.research(ids); if (r) await w.advance('qualify'); }}>
              {n ? `Research ${n} · budget ${cost} of ${BUDGET_TOTAL} today` : 'Pick at least one'}
            </button>
            <span className={s.hint}>One model call at a time on the platform — {n ? `about ${n * 2} minutes` : 'nothing queued'}</span>
          </div>
        </div>
      )}
    </DataBoundary>
  );
}
