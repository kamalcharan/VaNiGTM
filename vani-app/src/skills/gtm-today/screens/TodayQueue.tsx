'use client';
/**
 * /agents/gtm/today — G3, the queue. Not a dashboard: a ranked list of who
 * has gone quiet, why, and what it costs to leave them, with a decision per
 * row. Empty on day one, and the empty state says what to put in motion.
 * attention-skill has always computed this; no page ever asked it.
 */
import Link from 'next/link';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import a from '@/skills/gtm-audience/audience.module.css';
import type { AttentionItem, AttentionResult, Decision } from '../mock';

const REASON: Record<AttentionItem['reason'], string> = { owed_reply: 'owed a reply', wake_due: 'wake due', gone_quiet: 'gone quiet', never_touched: 'never touched' };

export default function TodayQueue() {
  const q = useSkillQuery<AttentionResult>('attention-skill', 'get_attention');
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['skill'] }), [qc]);
  const decide = useSkillMutation<{ decision: { decision: Decision } }>('attention-skill', 'decide_attention', {
    successMessage: (r) => r.decision.decision === 'acted' ? 'Noted — it leaves the queue.' : r.decision.decision === 'snoozed' ? 'Parked a week. It comes back on its own.' : 'Let go. It will not resurface.',
    errorMessage: 'Could not record that.', onSuccess: refresh,
  });
  return (
    <div>
      <div className={u.eyebrow}>// GTM · TODAY</div>
      <DataBoundary query={q} label="the queue" skeleton={<SkeletonRows rows={3} lines={2} />}>
        {(d: AttentionResult) => {
          if (d.empty_state === 'nothing_in_motion') {
            return (
              <>
                <h1 className={u.h1}>Nothing has gone quiet</h1>
                <p className={u.lede}>Because nothing is in motion yet. This queue ranks who to come back to — it fills the day after you put people in motion, not before.</p>
                <div className={a.card} style={{ maxWidth: 720, borderStyle: 'dashed' }}>
                  <div className={a.eyebrow}>// THE NEXT THING</div>
                  <h2 className={a.h} style={{ fontSize: 18 }}>Put the people you kept in motion</h2>
                  <p className={a.sub}>A segment, a story per segment, the cadence window — then this page has something to say every morning.</p>
                  <div className={a.actions}><Link href="/agents/gtm/motion" className={a.primary} style={{ textDecoration: 'none' }}>Put them in motion →</Link><Link href="/agents/gtm/audience" className={a.quiet} style={{ textDecoration: 'none' }}>Build the audience first</Link></div>
                </div>
              </>
            );
          }
          if (d.empty_state === 'all_handled') {
            return (
              <>
                <h1 className={u.h1}>Nothing waiting on you</h1>
                <p className={u.lede}>{d.context.journeys_in_play} in motion · {d.context.suppressed_handled} acted on · {d.context.suppressed_snoozed} parked · {d.context.suppressed_dismissed} let go. Parked ones come back on their wake date.</p>
              </>
            );
          }
          return (
            <>
              <h1 className={u.h1}>{d.items.length} to come back to</h1>
              <p className={u.lede}>Ranked by what it costs to leave them. Anyone already reserved this week is not here — the governor already has them. {d.context.journeys_in_play} in motion.</p>
              <div className={a.list}>
                {d.items.map((it) => (
                  <div key={it.prospect_id} className={`${a.row} ${a.rowNoTick}`}>
                    <div>
                      <div className={a.meta} style={{ marginTop: 0, marginBottom: 4 }}><span className={`${a.chip} ${it.urgent ? a.chipBad : a.chipWarn}`}>{REASON[it.reason]}{it.days_quiet ? ` · ${it.days_quiet} days` : ''}</span><span>{it.journey_state} · {it.offer}</span></div>
                      <div className={a.name}><Link href={`/agents/gtm/people/${it.contact_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{it.person}</Link><small>{it.contact_ref} · {it.company}</small></div>
                      <div className={a.why}>{it.detail}</div>
                    </div>
                    <div className={a.seg}>
                      <button type="button" disabled={decide.isPending} onClick={() => void decide.mutate({ prospect_id: it.prospect_id, decision: 'acted' })}>Act</button>
                      <button type="button" className="later" disabled={decide.isPending} onClick={() => void decide.mutate({ prospect_id: it.prospect_id, decision: 'snoozed', snooze_days: 7 })}>Park a week</button>
                      <button type="button" className="bad" disabled={decide.isPending} onClick={() => void decide.mutate({ prospect_id: it.prospect_id, decision: 'dismissed', reason: 'let go from Today' })}>Let go</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        }}
      </DataBoundary>
    </div>
  );
}
