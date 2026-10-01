'use client';

import Link from 'next/link';
import { useSkillQuery } from '@/lib/useSkill';
import { formatDateTime } from '@/lib/format';
import { DataBoundary, SkeletonTable } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import { RunsSubnav } from './RunsList';

interface EventRow {
  id: string; event_type: string; source_type: string; status: 'pending' | 'processing' | 'done' | 'failed';
  attempts: number | null; created_at: string; started_at: string | null; processed_at: string | null;
  error: string | null; age_seconds: number; run_id: string | null; run_status: string | null;
  handled: boolean; consumed: boolean;
}
interface Events { events: EventRow[]; unconsumed: EventRow[]; counts: Record<string, number> }

function age(s: number): string {
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/**
 * The bus, made visible. The worker used to resolve an event with no handler
 * as `done` and move on; PROFILE_COMPLETE sat there for weeks looking
 * finished. It is now listed under "nobody consumes" — rule 12 for the queue.
 */
export default function EventsList() {
  const q = useSkillQuery<Events>('runs', 'events', { limit: 200 });

  return (
    <div>
      <div className={u.eyebrow}>// SYSTEM</div>
      <h1 className={u.h1}>Events</h1>
      <p className={u.lede}>
        Everything emitted on the bus for this workspace: who emitted it, whether a worker claimed it, how many
        attempts it took, and whether any agent is listening at all.
      </p>
      <RunsSubnav active="events" />

      <DataBoundary
        query={q}
        label="events"
        skeleton={<SkeletonTable rows={6} cols={7} />}
        isEmpty={(d) => !d?.events?.length}
        empty="No events yet. Submitting your website in the Smart Profile emits the first one."
      >
        {(d) => (
          <>
            <div className={u.counters}>
              {(['pending', 'processing', 'done', 'failed'] as const).map((k) => (
                <div key={k} className={u.counter}><div className={u.cVal}>{d.counts[k] ?? 0}</div><div className={u.cLbl}>{k}</div></div>
              ))}
            </div>

            <section className={u.card}>
              <div className={u.cardHead}>
                Emitted, and nobody consumes it
                <span className={`${u.tag} ${d.unconsumed.length ? u.tagWarn : u.tagOk}`}>{d.unconsumed.length}</span>
              </div>
              <div className={u.cardBody}>
                {d.unconsumed.length === 0 ? (
                  <div className={u.agDesc}>Every event type on the bus has a registered handler.</div>
                ) : (
                  <>
                    <div className={u.agDesc} style={{ marginBottom: 8 }}>
                      These event types have no agent registered for them. They were emitted because something crossed a
                      line — a profile became complete, a deck was ready — and nothing acted on it. That is a gap in the
                      product, not a failure of the run.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Array.from(new Set(d.unconsumed.map((e) => e.event_type))).map((t) => (
                        <span key={t} className={`${u.tag} ${u.tagWarn}`}>{t} × {d.unconsumed.filter((e) => e.event_type === t).length}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className={u.card}>
              <div className={u.cardHead}>All events<span className={u.cardMeta}>newest first</span></div>
              <div className={u.tableWrap}>
                <table className={u.table}>
                  <thead>
                    <tr><th>Type</th><th>Source</th><th>Status</th><th>Attempts</th><th>Age</th><th>Emitted</th><th>Run</th></tr>
                  </thead>
                  <tbody>
                    {d.events.map((e) => (
                      <tr key={e.id}>
                        <td className={u.mono}>
                          {e.event_type}
                          {!e.handled && <span className={`${u.tag} ${u.tagWarn}`} style={{ marginLeft: 6 }}>no handler</span>}
                        </td>
                        <td><span className={`${u.tag} ${u.tagDim}`}>{e.source_type}</span></td>
                        <td>
                          <span className={`${u.tag} ${e.status === 'done' ? u.tagOk : e.status === 'failed' ? u.tagBad : u.tagWarn}`}>{e.status}</span>
                          {e.error && <div className={u.agScope}>{e.error}</div>}
                        </td>
                        <td className={u.mono}>{e.attempts ?? 0}</td>
                        <td className={u.mono}>{age(e.age_seconds)}</td>
                        <td className={u.mono}>{formatDateTime(e.created_at)}</td>
                        <td className={u.mono}>
                          {e.run_id
                            ? <Link href={`/runs/${e.run_id}`} style={{ color: 'var(--ac)', textDecoration: 'none' }}>{e.run_id} · {e.run_status}</Link>
                            : <span className={u.agScope}>{e.handled ? '—' : 'none'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </DataBoundary>
    </div>
  );
}
