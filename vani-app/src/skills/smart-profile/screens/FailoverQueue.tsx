'use client';
/**
 * Runs parked on a failover decision — the console for what only the CLI
 * could answer before.
 *
 * With HAIKU_DEFAULT=false, a platform-model failure parks the run at
 * `awaiting` with the REAL server error instead of spending Vikuna's Anthropic
 * key on its own (VaNiGTM rule 12's one approved exception, made opt-in on
 * 2026-09-18). Approving RE-EMITS the original event on the failover model —
 * a new run, a real cost. Declining fails the run with its cause and spends
 * nothing. Both are one click here, with the server's own error in front of
 * the person deciding, because "cannot reach" and "context size exceeded"
 * call for different fixes and the second is not solved by paying for it.
 *
 * Rendered only when something is waiting: an empty queue on the Knowledge
 * page is the normal state, not a state to announce.
 */
import { useEffect } from 'react';
import { formatDateTime } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../smart-profile.module.css';
import { useFailovers, useResolveFailover, type PendingFailover } from '../useKnowledge';

const hint = (e: string | null) => {
  if (!e) return null;
  if (/context size/i.test(e)) return 'The platform model ran out of window on this prompt. Approving retries it on a bigger model and costs money; the lasting fix is LLM_CONTEXT_TOKENS set to the server’s real window (the deploy after 2026-09-25 sizes ingestion chunks from it).';
  if (/cannot reach|timeout|ECONNREFUSED|unreachable/i.test(e)) return 'The platform model did not answer at all. If it is down, approving is the only way this run finishes today; declining keeps it for a re-run once the model is back.';
  return null;
};

/** `signal` changes whenever a source flips state; the queue re-reads then, so a run parked a moment ago shows without a reload. */
export function FailoverQueue({ signal }: { signal: string }) {
  const q = useFailovers();
  const refetch = q.refetch;
  useEffect(() => { void refetch(); }, [signal, refetch]);
  const { resolve, busy } = useResolveFailover();
  const runs: PendingFailover[] = q.data?.data?.runs ?? [];
  if (!runs.length) return null;
  return (
    <section className={s.section}>
      <header className={s.sectionHead}>
        <div className={s.sectionTitles}>
          <h2 className={s.sectionTitle}>Waiting on your decision</h2>
          <p className={s.sectionWhat}>{q.data?.data?.detail} The platform model failed; each run can be retried on a paid failover model, or let go. Nothing is spent until you say so.</p>
        </div>
      </header>
      <div className={s.sectionBody}>
        <ul className={s.rows}>
          {runs.map((r) => {
            const h = hint(r.vps_error);
            return (
              <li key={r.run_id} className={s.srcRow} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div className={s.row}>
                  <span className={s.rowName}>run {r.run_id}<span className={s.rowTagMuted}>{r.agent}</span></span>
                  <span className={s.rowDetail}>asked {formatDateTime(r.asked_at)}{r.failover_model ? ` · failover to ${r.failover_model}` : ''}</span>
                </div>
                {r.vps_error && <div className={s.srcBad} style={{ fontSize: 12.5, fontFamily: 'var(--mono)', wordBreak: 'break-word' }}>{r.vps_error}</div>}
                {h && <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--tx2)' }}>{h}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className={`${u.tag} ${u.tagOk}`} style={{ cursor: 'pointer', font: 'inherit', fontSize: 12, padding: '6px 12px' }} disabled={busy} onClick={() => void resolve(r.run_id, true)}>Approve — retry on {r.failover_model ?? 'the failover model'}</button>
                  <button type="button" className={`${u.tag} ${u.tagDim}`} style={{ cursor: 'pointer', font: 'inherit', fontSize: 12, padding: '6px 12px' }} disabled={busy} onClick={() => void resolve(r.run_id, false)}>Decline — fail it, spend nothing</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
