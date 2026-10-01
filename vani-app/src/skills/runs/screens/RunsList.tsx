'use client';

import Link from 'next/link';
import { useSkillQuery } from '@/lib/useSkill';
import type { RunRow } from '@/lib/mock-transport';
import { formatDateTime } from '@/lib/format';
import { DataBoundary, SkeletonTable } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';

/** The API's five statuses onto the three tag colours; 'ok' is the fixture's old spelling. */
export function statusTag(status: RunRow['status']): string {
  if (status === 'ok' || status === 'completed') return u.tagOk;
  if (status === 'running' || status === 'queued' || status === 'awaiting') return u.tagWarn;
  return u.tagBad;
}

export function RunsSubnav({ active }: { active: 'runs' | 'awaiting' | 'events' }) {
  const item = (key: typeof active, href: string, label: string) => (
    <Link href={href} className={`${u.tag} ${active === key ? u.tagOk : u.tagDim}`} style={{ textDecoration: 'none' }}>
      {label}
    </Link>
  );
  return (
    <div style={{ display: 'flex', gap: 8, margin: '4px 0 14px' }}>
      {item('runs', '/runs', 'Runs')}
      {item('awaiting', '/runs/awaiting', 'Waiting on you')}
      {item('events', '/runs/events', 'Events')}
    </div>
  );
}

/**
 * Read-only by design. The platform spec's audit spine is append-only and
 * `actor_type` is never "model" — this screen is where that becomes visible,
 * so the actor column is deliberately prominent.
 */
export default function RunsList() {
  const q = useSkillQuery<{ runs: RunRow[] }>('runs', 'list', { limit: 100 });

  return (
    <div>
      <div className={u.eyebrow}>// SYSTEM</div>
      <h1 className={u.h1}>Runs &amp; Traces</h1>
      <p className={u.lede}>
        Every agent run, with the actor that caused it. Actors are only ever
        <strong> human, rule, timer or system</strong> — a model score is never an
        actor, and the database enforces it.
      </p>
      <RunsSubnav active="runs" />

      <section className={u.card}>
        <div className={u.cardHead}>
          Recent runs
          <span className={u.cardMeta}>append-only · newest first</span>
        </div>
        <DataBoundary
          query={q}
          label="runs"
          skeleton={<SkeletonTable rows={6} cols={8} />}
          isEmpty={(d) => !d?.runs?.length}
          empty="No runs have been recorded for this workspace yet. The first one appears the moment an agent starts — reading your website in the Smart Profile is the usual first run."
        >
          {(d) => (
            <div className={u.tableWrap}>
              <table className={u.table}>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Agent</th>
                    <th>Trigger</th>
                    <th>Actor</th>
                    <th>Started</th>
                    <th>Steps</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.runs.map((r) => (
                    <tr key={r.id}>
                      <td className={u.mono}>
                        <Link href={`/runs/${encodeURIComponent(r.id)}`} style={{ color: 'var(--ac)', textDecoration: 'none' }}>
                          {r.id}
                        </Link>
                      </td>
                      <td>{r.agent}</td>
                      <td className={u.mono}>{r.trigger}</td>
                      <td>
                        <span className={`${u.tag} ${u.tagDim}`}>{r.actor}</span>
                      </td>
                      <td className={u.mono}>{r.started_at ? formatDateTime(r.started_at) : r.started}</td>
                      <td>{r.steps}</td>
                      <td className={u.mono}>{r.duration}</td>
                      <td>
                        <span className={`${u.tag} ${statusTag(r.status)}`}>
                          {r.status === 'ok' ? 'completed' : r.status}
                          {r.awaiting ? ' · on you' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataBoundary>
      </section>
    </div>
  );
}
