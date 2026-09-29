'use client';
/**
 * Station 9 — the governor's window, BEFORE anything is scheduled. Sent
 * touches and held reservations both count; a person whose window is full is
 * refused with the reason. First time migration 223 has been on a screen.
 */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import a from '@/skills/gtm-audience/audience.module.css';
import s from '../motion.module.css';
import { useCadencePlan, useMotionWrites } from '../useMotion';
import type { CadenceRow, Policy } from '../mock';

export function CadenceStep() {
  const q = useCadencePlan();
  const w = useMotionWrites();
  return (
    <DataBoundary query={q} label="the window" skeleton={<SkeletonRows rows={4} />}>
      {(d: { rows: CadenceRow[]; policy: Policy }) => {
        const already = d.rows.filter((r) => r.in_window > 0).length;
        const open = d.rows.filter((r) => r.open_now).length;
        return (
          <div className={a.card}>
            <div className={a.eyebrow}>// PUT THEM IN MOTION · 3 OF 4</div>
            <h1 className={a.h}>The window, before anything is scheduled</h1>
            <p className={a.sub}>{d.policy.max_touches} touches per person per rolling {d.policy.window_days} days, across every channel and every agent. Sent touches and held reservations both count. <b>{already} of {d.rows.length}</b> already have a touch this week — this plan takes what is left, and refuses where there is none.</p>
            <div className={s.win}>
              {d.rows.map((r) => (
                <div key={r.contact_id} style={{ display: 'contents' }}>
                  <div className={s.winName}>{r.name}<small>{r.contact_ref} · {r.company}</small></div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div className={s.slots}>{Array.from({ length: d.policy.max_touches }, (_, i) => <i key={i} className={i < r.in_window ? s.used : r.open_now && i === r.in_window ? s.plan : ''} />)}</div>
                    <span className={s.w}>{r.in_window ? `${r.in_window} used` : 'free'} · {r.open_now ? '1 planned' : <b className={s.refused}>refused — {r.reason}</b>}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className={a.note}>quiet hours {d.policy.quiet_hours} {d.policy.timezone} · quiet days {d.policy.quiet_days.join(', ')} · assisted touches (LinkedIn, X) count here too · {d.policy.using_built_in ? 'built-in policy' : 'your policy'}</p>
            <div className={a.actions}>
              <button type="button" className={a.primary} disabled={w.busy || !open} onClick={async () => { const r = await w.reserve(); if (r) await w.advance('send'); }}>Reserve {open} {open === 1 ? 'slot' : 'slots'} →</button>
              <span className={a.hint}>Reserved, not just counted — the reservation is what the next plan collides with.</span>
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}
