'use client';

import Link from 'next/link';
import { useSkillQuery } from '@/lib/useSkill';
import { formatDateTime } from '@/lib/format';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import { RunsSubnav, statusTag } from './RunsList';

interface Step {
  ts?: string;
  step_name: string;
  action?: string;
  input_summary?: string;
  output_summary?: string;
  duration_ms?: number;
  status: 'ok' | 'error' | 'skipped' | 'running';
}

interface RunGet {
  run: {
    id: string; agent: string; status: 'queued' | 'running' | 'awaiting' | 'completed' | 'failed';
    trigger: string; actor: string; started_at: string; completed_at: string | null;
    duration: string; duration_ms: number | null;
    awaiting_input: Record<string, unknown> | null; checkpoint_keys: string[]; last_checkpoint: string | null;
    output: unknown; token_usage: unknown; inputs: Record<string, unknown> | null;
    error: string | null; error_trace: string | null;
  } | null;
  steps: Step[];
  changed: { count: number; nodes: { label: string; name: string; updated_at: string }[] };
  event: { id: string; type: string; source_type: string; status: string; attempts: number | null; error: string | null } | null;
  reason?: string;
  detail?: string;
}

/** One run in full — the step timeline, what it waits for, what it changed. */
export default function RunDetail({ runId }: { runId: string }) {
  const q = useSkillQuery<RunGet>('runs', 'get', { run_id: runId });

  return (
    <div>
      <div className={u.eyebrow}>// SYSTEM · RUN</div>
      <h1 className={u.h1}>Run {runId}</h1>
      <p className={u.lede}>Every step the agent recorded, in the order it happened. Nothing here is summarised by a model.</p>
      <RunsSubnav active="runs" />

      <DataBoundary
        query={q}
        label="run"
        skeleton={<SkeletonRows rows={6} lines={2} />}
        isEmpty={(d) => !d?.run}
        empty="There is no run with this number in your workspace."
      >
        {(d) => {
          const r = d.run!;
          const a = r.awaiting_input ?? null;
          return (
            <>
              <section className={u.card}>
                <div className={u.cardHead}>
                  {r.agent}
                  <span className={`${u.tag} ${statusTag(r.status)}`}>{r.status}</span>
                </div>
                <div className={u.cardBody}>
                  <div className={u.counters}>
                    <div className={u.counter}><div className={u.cLbl}>Trigger</div><div className={u.mono}>{r.trigger}</div></div>
                    <div className={u.counter}><div className={u.cLbl}>Actor</div><div>{r.actor}</div></div>
                    <div className={u.counter}><div className={u.cLbl}>Started</div><div className={u.mono}>{formatDateTime(r.started_at)}</div></div>
                    <div className={u.counter}><div className={u.cLbl}>Duration</div><div className={u.mono}>{r.duration}</div></div>
                  </div>
                  {d.event && (
                    <div className={u.agScope} style={{ marginTop: 10 }}>
                      Event {d.event.type} · {d.event.status}
                      {d.event.attempts != null ? ` · attempt ${d.event.attempts}` : ''}
                      {d.event.error ? ` · ${d.event.error}` : ''}
                    </div>
                  )}
                  {r.error && (
                    <div className={u.agDesc} style={{ marginTop: 10, color: 'var(--bad, #c0392b)' }}>
                      Failed: {r.error}
                    </div>
                  )}
                  {r.error_trace && (
                    <pre className={u.mono} style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-sm)', marginTop: 8 }}>{r.error_trace}</pre>
                  )}
                </div>
              </section>

              {a && (
                <section className={u.card}>
                  <div className={u.cardHead}>
                    Waiting on you
                    <span className={u.cardMeta}>{String(a.kind ?? a.type ?? 'input')}</span>
                  </div>
                  <div className={u.cardBody}>
                    <div className={u.agDesc}>{String(a.question ?? a.prompt ?? 'This run is parked and needs an answer.')}</div>
                    {String(a.kind ?? '') === 'llm_failover_approval' && (
                      <Link href="/smart-profile/knowledge" className={u.cardMeta} style={{ display: 'inline-block', marginTop: 8, color: 'var(--ac)' }}>
                        Decide in Knowledge → (approve or decline the escalation)
                      </Link>
                    )}
                  </div>
                </section>
              )}

              <section className={u.card}>
                <div className={u.cardHead}>
                  Steps
                  <span className={u.cardMeta}>{d.steps.length} recorded{r.checkpoint_keys.length ? ` · checkpoint: ${r.checkpoint_keys.join(', ')}` : ''}</span>
                </div>
                {d.steps.length === 0 ? (
                  <div className={u.cardBody}><div className={u.agDesc}>No steps were recorded before the run ended.</div></div>
                ) : (
                  <div className={u.tableWrap}>
                    <table className={u.table}>
                      <thead>
                        <tr><th>When</th><th>Step</th><th>Action</th><th>Result</th><th>Took</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {d.steps.map((s, i) => (
                          <tr key={i}>
                            <td className={u.mono}>{s.ts ? formatDateTime(s.ts) : '—'}</td>
                            <td className={u.mono}>{s.step_name}</td>
                            <td>{s.action ?? ''}</td>
                            <td>{s.output_summary ?? s.input_summary ?? ''}</td>
                            <td className={u.mono}>{s.duration_ms != null ? `${s.duration_ms}ms` : ''}</td>
                            <td><span className={`${u.tag} ${s.status === 'ok' ? u.tagOk : s.status === 'error' ? u.tagBad : u.tagDim}`}>{s.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className={u.card}>
                <div className={u.cardHead}>
                  What this run changed
                  <span className={u.cardMeta}>{d.changed.count} in the knowledge graph</span>
                </div>
                <div className={u.cardBody}>
                  {d.changed.count === 0 ? (
                    <div className={u.agDesc}>This run wrote nothing into the Brain. Runs that read a source or answer a question usually do; runs that only decide do not.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {d.changed.nodes.map((n) => (
                        <span key={`${n.label}:${n.name}`} className={`${u.tag} ${u.tagDim}`}>{n.label} · {n.name}</span>
                      ))}
                      {d.changed.count > d.changed.nodes.length && <span className={u.cardMeta}>+{d.changed.count - d.changed.nodes.length} more</span>}
                    </div>
                  )}
                  <Link href="/smart-profile/knowledge-graph" className={u.cardMeta} style={{ display: 'inline-block', marginTop: 10, color: 'var(--ac)' }}>
                    Open the knowledge graph →
                  </Link>
                </div>
              </section>
            </>
          );
        }}
      </DataBoundary>
    </div>
  );
}
