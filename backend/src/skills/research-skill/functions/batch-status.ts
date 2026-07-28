/**
 * research-skill: batch_status
 *
 * Whether the last batch is queued, running, finished — or sitting in a queue
 * nobody is reading.
 *
 * The worker is a separate process (`npm run worker`). When it is not running
 * the screen's "queued 10 companies" is technically true and practically a
 * lie: the event never leaves 'pending' and no brief ever appears. There was
 * no way to tell from any screen, which is exactly the silent failure
 * CLAUDE.md rule 12 exists to prevent.
 *
 * The detection is deliberately simple. The worker polls every 3 seconds, so
 * an event still 'pending' after 30 is not slow — nothing is consuming the
 * bus.
 */

import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../shared/types';

const QUERY = path.resolve(__dirname, '..', 'queries', 'batch-status.sql');

type Verdict =
  | 'never_run' | 'queued' | 'running' | 'worker_down'
  | 'failed' | 'completed' | 'unknown';

const MESSAGE: Record<Verdict, string> = {
  never_run:   'No research has been queued yet.',
  queued:      'Queued — the worker picks it up within a few seconds.',
  running:     'Running. Each company takes 2-4 minutes.',
  worker_down: 'Queued, but nothing has picked it up. The worker process is '
             + 'almost certainly not running — start it with `npm run worker` '
             + 'and this batch will resume on its own.',
  failed:      'The last batch failed. Nothing already researched was lost.',
  completed:   'The last batch finished.',
  unknown:     'State unclear — check the agent runs feed.',
};

export async function batch_status(_params: Record<string, unknown>, ctx: SkillContext) {
  const res = await ctx.db.query<Record<string, unknown>>(
    fs.readFileSync(QUERY, 'utf8'),
    { tenant_id: ctx.tenant_id },
  );

  const row = res.rows[0];
  if (!row) {
    return {
      verdict: 'never_run' as Verdict,
      message: MESSAGE.never_run,
      healthy: true,
      recipe: 'batch-status' as const,
    };
  }

  const verdict = (row.verdict as Verdict) ?? 'unknown';
  return {
    verdict,
    message: MESSAGE[verdict] ?? MESSAGE.unknown,
    // The one thing the screen colours on: is anything wrong right now.
    healthy: verdict !== 'worker_down' && verdict !== 'failed',
    done_count: Number(row.done_count ?? 0),
    requested: row.requested === null ? null : Number(row.requested),
    run_id: row.run_id ?? null,
    run_status: row.run_status ?? null,
    event_status: row.event_status ?? null,
    event_age_seconds: Number(row.event_age_seconds ?? 0),
    error: row.error_trace ?? row.event_error ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    recipe: 'batch-status' as const,
  };
}
