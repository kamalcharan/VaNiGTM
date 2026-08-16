'use client';

import { useSkillQuery } from '@/lib/useSkill';
import type { RunRow } from '@/lib/mock-transport';
import u from '@/platform/shell/ui.module.css';

/**
 * Read-only by design. The platform spec's audit spine is append-only and
 * `actor_type` is never "model" — this screen is where that becomes visible,
 * so the actor column is deliberately prominent.
 */
export default function RunsList() {
  const q = useSkillQuery<{ runs: RunRow[] }>('runs', 'list');

  return (
    <div>
      <div className={u.eyebrow}>// SYSTEM</div>
      <h1 className={u.h1}>Runs &amp; Traces</h1>
      <p className={u.lede}>
        Every agent run, with the actor that caused it. Actors are only ever
        <strong> human, rule, timer or system</strong> — a model score is never an
        actor, and the database enforces it.
      </p>

      <section className={u.card}>
        <div className={u.cardHead}>
          Recent runs
          <span className={u.cardMeta}>append-only</span>
        </div>
        {q.isLoading && <div className={u.loading}>Loading runs…</div>}
        {q.isError && <div className={u.error}>Could not load runs.</div>}
        {q.data?.data && (
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
                {q.data.data.runs.map((r) => (
                  <tr key={r.id}>
                    <td className={u.mono}>{r.id}</td>
                    <td>{r.agent}</td>
                    <td className={u.mono}>{r.trigger}</td>
                    <td>
                      <span className={`${u.tag} ${u.tagDim}`}>{r.actor}</span>
                    </td>
                    <td className={u.mono}>{r.started}</td>
                    <td>{r.steps}</td>
                    <td className={u.mono}>{r.duration}</td>
                    <td>
                      <span
                        className={`${u.tag} ${
                          r.status === 'ok' ? u.tagOk : r.status === 'running' ? u.tagWarn : u.tagBad
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
