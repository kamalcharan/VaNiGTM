/**
 * pulse-skill: list_pulse_queue
 *
 * Returns all clients with an active pulse config + their latest/next session.
 * Also returns aggregate stats (overdue, due_this_week, upcoming, completed_ytd)
 * for the Pulse Queue header strip.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const LIST_SQL  = fs.readFileSync(path.join(__dirname, '../queries/list-pulse-queue.sql'),  'utf-8');
const STATS_SQL = fs.readFileSync(path.join(__dirname, '../queries/pulse-queue-stats.sql'), 'utf-8');

export interface PulseQueueItem {
  config_id:          number;
  client_id:          number;
  frequency:          'monthly' | 'bimonthly' | 'quarterly' | 'custom';
  template:           string;
  medium:             string;
  jtd_auto_schedule:  boolean;
  vani_auto_brief:    boolean;
  assigned_to:        string | null;
  // Client
  client_name:        string;
  client_prefix:      string;
  initials:           string;
  // Latest session
  session_id:         number | null;
  scheduled_at:       string | null;
  session_status:     string | null;
  started_at:         string | null;
  ended_at:           string | null;
  duration_minutes:   number | null;
  session_medium:     string | null;
  vani_brief:         string | null;
  // Computed
  urgency:            'overdue' | 'due_soon' | 'upcoming' | 'completed' | 'no_session';
  days_from_now:      number | null;
  last_completed_at:  string | null;
  completed_ytd:      number;
}

export interface PulseQueueStats {
  overdue_count:       number;
  due_this_week_count: number;
  upcoming_count:      number;
  completed_ytd:       number;
  total_configs:       number;
}

interface ListPulseQueueParams {
  urgency?:   'overdue' | 'due_soon' | 'upcoming' | 'completed' | 'no_session';
  frequency?: 'monthly' | 'bimonthly' | 'quarterly' | 'custom';
  limit?:     number;
  offset?:    number;
}

interface ListPulseQueueResult {
  items:  PulseQueueItem[];
  stats:  PulseQueueStats;
  total:  number;
  recipe: 'pulse-queue';
}

export async function list_pulse_queue(
  params: ListPulseQueueParams,
  ctx: SkillContext,
): Promise<ListPulseQueueResult> {
  const limit  = Math.min(params.limit  ?? 50, 200);
  const offset = params.offset ?? 0;

  const qp = {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $urgency:   params.urgency   ?? null,
    $frequency: params.frequency ?? null,
    $limit:     limit,
    $offset:    offset,
  };

  const [listRes, statsRes] = await Promise.all([
    ctx.db.query<PulseQueueItem>(LIST_SQL, qp),
    ctx.db.query<PulseQueueStats>(STATS_SQL, {
      $tenant_id: ctx.tenant_id,
      $is_live:   ctx.is_live,
    }),
  ]);

  const stats = statsRes.rows[0] ?? {
    overdue_count: 0, due_this_week_count: 0,
    upcoming_count: 0, completed_ytd: 0, total_configs: 0,
  };

  return {
    items:  listRes.rows,
    stats,
    total:  stats.total_configs,
    recipe: 'pulse-queue',
  };
}
