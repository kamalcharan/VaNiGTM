'use client';
/**
 * One company's readiness: the score, the level (and why it is not higher when
 * a gate holds it), the seven parts with what earned each, and when the record
 * was last refreshed. Read from scoring.explain — computed now, so it always
 * matches the profile in force. Used on the tenant's company page and on the
 * pool's company panel.
 */
import { useState } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from './scoring.module.css';
import { LEVEL_LABEL, useExplain, type Explained } from './useScoring';

export function ScoreCard({ prospectId, companyId }: { prospectId?: string | number; companyId?: string | number }) {
  const q = useExplain({ prospectId, companyId });
  return (
    <section className={u.card}>
      <div className={u.cardHead}>Readiness<span className={u.cardMeta}>0–100 · plain arithmetic, no model</span></div>
      <DataBoundary query={q} label="the score" skeleton={<SkeletonRows rows={4} />}
        isEmpty={(d) => d.reason === 'NOT_FOUND'} empty={<p className={s.note}>This company is not scored — it may have been removed.</p>}>
        {(d) => <Body d={d} pool={companyId != null} />}
      </DataBoundary>
    </section>
  );
}

function Body({ d, pool }: { d: Explained; pool: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className={s.body}>
      <div className={s.head}>
        <span className={s.big}>{d.score}<small> / 100</small></span>
        <span className={`${s.level} ${s[`l_${d.level}`]}`}>{LEVEL_LABEL[d.level]}</span>
      </div>
      {d.level_reason && <p className={s.note}>{d.level_reason}</p>}
      <div className={s.parts}>
        {d.parts.map((p) => (
          <div key={p.key}>
            <button type="button" className={s.part} onClick={() => setOpen(open === p.key ? null : p.key)} aria-expanded={open === p.key}>
              <span className={s.partName}>{p.label}</span>
              <span className={s.bar} aria-hidden><span style={{ width: `${p.weight ? (p.earned / p.weight) * 100 : 0}%` }} /></span>
              <span className={s.partNum}>{p.measured ? `${p.earned} / ${p.weight}` : `— / ${p.weight}`}</span>
            </button>
            {open === p.key && (
              <ul className={s.items}>
                {!p.measured && <li className={s.muted}>{pool && ['people', 'research', 'signals'].includes(p.key)
                  ? 'Earned in a tenant\'s own copy — a pool company tops out near 70 by design.' : 'Not measured yet — signals arrive with P4.'}</li>}
                {p.items.map((it) => (
                  <li key={it.key} className={it.earned ? s.itemOn : s.itemOff}>
                    <span>{it.label}</span>
                    <span className={s.muted}>{it.earned ? it.evidence || 'yes' : 'not yet'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className={s.foot}>
        {d.profile.scope === 'tenant' ? `Your scoring v${d.profile.version} (levels: platform v${d.profile.platform_version})` : `Platform default v${d.profile.version}`}
        {' · '}last refreshed {d.last_refreshed ? formatDate(d.last_refreshed) : '—'}
      </p>
    </div>
  );
}
