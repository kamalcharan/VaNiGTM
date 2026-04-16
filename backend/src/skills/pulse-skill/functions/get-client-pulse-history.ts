/**
 * pulse-skill: get_client_pulse_history
 *
 * Returns pulse sessions for a specific client, newest first.
 * Each session includes its actions aggregated as a JSON array.
 * Used by the Pulse History tab in the client and contact profiles.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const HISTORY_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-client-pulse-history.sql'), 'utf-8');

export interface PulseSessionAction {
  id:           number;
  text:         string;
  owner_type:   'mfd' | 'client' | 'auto';
  due_date:     string | null;
  status:       'open' | 'done' | 'cancelled';
  completed_at: string | null;
}

export interface PulseHistoryItem {
  id:                 number;
  config_id:          number | null;
  client_id:          number;
  contact_id:         number | null;
  scheduled_at:       string;
  started_at:         string | null;
  ended_at:           string | null;
  duration_minutes:   number | null;
  status:             string;
  template:           string;
  medium:             string;
  meeting_notes:      string | null;
  vani_summary:       string | null;
  summary_confirmed:  boolean;
  report_generated:   boolean;
  next_session_id:    number | null;
  assigned_to:        string | null;
  created_at:         string;
  actions:            PulseSessionAction[];
  gap_count:          number;
}

interface GetClientPulseHistoryParams {
  client_id: number;
  limit?:    number;
  offset?:   number;
}

interface GetClientPulseHistoryResult {
  sessions: PulseHistoryItem[];
  total:    number;
  recipe:   'pulse-history';
}

export async function get_client_pulse_history(
  params: GetClientPulseHistoryParams,
  ctx: SkillContext,
): Promise<GetClientPulseHistoryResult> {
  if (!params.client_id) {
    throw Object.assign(new Error('client_id is required'), { code: 'VALIDATION_ERROR' });
  }

  const limit  = Math.min(params.limit  ?? 20, 100);
  const offset = params.offset ?? 0;

  const res = await ctx.db.query<PulseHistoryItem>(HISTORY_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $client_id: params.client_id,
    $limit:     limit,
    $offset:    offset,
  });

  return {
    sessions: res.rows,
    total:    res.rows.length,   // for history, count from result is sufficient
    recipe:   'pulse-history',
  };
}
