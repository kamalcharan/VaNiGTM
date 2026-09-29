'use client';
/**
 * Station 3 — which of these are worth researching.
 *
 * Research costs a budget, so this is a decision, not a default. Rows in
 * range with a domain are pre-ticked; the weak ones are pre-unticked and say
 * why; a row with no domain cannot be ticked at all and says that. A row that
 * already has a brief is shown with it, and is only re-researched on purpose.
 *
 * The button calls `research-skill.start_research` with real prospect ids.
 * The server validates the offers first and reports the split — selected,
 * reachable, already researched, queued — before anything runs.
 */
import { useEffect, useState } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useAudienceWrites, useBudget, useHotList } from '../useAudience';
import type { HotList } from '../mock-data';
import { RowCard } from './BringStep';
import s from '../audience.module.css';

const DECIDED = new Set(['approved', 'rejected', 'no_contact']);

export function FindStep() {
  const q = useHotList();
  const budget = useBudget();
  const w = useAudienceWrites();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [redo, setRedo] = useState(false);
  const rows = q.data?.data?.rows;

  // Seed the selection once from the agent's own judgement: in range, with a
  // domain, not weak, not already researched. The tenant edits from there.
  useEffect(() => {
    if (rows && picked === null) setPicked(new Set(rows.filter((r) => r.has_domain && !r.weak && !r.research_status).map((r) => r.id)));
  }, [rows, picked]);

  const n = picked?.size ?? 0;
  const b = budget.data?.data;
  const affordable = b?.affordable_companies ?? null;
  const overBudget = affordable != null && n > affordable;

  return (
    <DataBoundary query={q} label="companies" skeleton={<SkeletonRows rows={5} lines={2} />}>
      {(d: HotList) => (
        <div className={s.card}>
          <div className={s.eyebrow}>// BUILD THE AUDIENCE · 2 OF 4</div>
          <h1 className={s.h}>Which of these are worth researching?</h1>
          <p className={s.sub}>Research costs a budget, so this is a decision, not a default. Every row says what is already known; untick the obvious misses. The ones below your range are pre-unticked and say why. A company with a brief already is not read twice unless you say so.</p>
          <div className={s.list}>
            {d.rows.map((r) => {
              const on = !!picked?.has(r.id);
              const researched = !!r.research_status;
              return (
                <RowCard key={r.id} r={r} on={on} off={!on && (r.weak || !r.has_domain)}
                  onTick={() => setPicked((p) => { const nx = new Set(p ?? []); if (nx.has(r.id)) nx.delete(r.id); else nx.add(r.id); return nx; })}>
                  <span className={s.side}>{!r.has_domain ? 'no domain' : on ? (researched ? (redo ? 'research again' : 'has a brief') : 'research') : researched && DECIDED.has(r.research_status ?? '') ? 'decided' : researched ? 'researched' : 'skip'}</span>
                </RowCard>
              );
            })}
          </div>
          <div className={s.actions}>
            <button type="button" className={s.primary} disabled={!n || w.busy || overBudget}
              onClick={async () => { const r = await w.research([...(picked ?? [])], redo); if (r) await w.advance('qualify'); }}>
              {n ? `Research ${n}${affordable != null ? ` · ${affordable} affordable today` : ''}` : 'Pick at least one'}
            </button>
            <label className={s.hint} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} /> re-read companies that already have a brief
            </label>
            {overBudget ? <span className={s.hint} style={{ color: 'var(--warn)' }}>Over today&rsquo;s budget — {affordable} affordable. Untick some, or raise the cap in Settings.</span>
              : <span className={s.hint}>{b?.tracked === false ? 'Usage metered, no cap — your own key.' : 'One model call at a time on the platform — a few minutes per company.'}</span>}
          </div>
        </div>
      )}
    </DataBoundary>
  );
}
