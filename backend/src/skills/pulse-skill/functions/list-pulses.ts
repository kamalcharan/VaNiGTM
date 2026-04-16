/**
 * pulse-skill: list_pulses
 *
 * Returns a paginated list of pulses for the tenant, optionally filtered
 * by contact_id, client_id, status, origin, or pulse_type.
 * Joins ki_contacts to resolve subject display names in-query.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const LIST_SQL  = fs.readFileSync(path.join(__dirname, '../queries/list-pulses.sql'),  'utf-8');
const COUNT_SQL = fs.readFileSync(path.join(__dirname, '../queries/count-pulses.sql'), 'utf-8');

export interface PulseItem {
  id:            number;
  pulse_type:    string;
  origin:        'system' | 'manual';
  status:        'open' | 'snoozed' | 'done' | 'dismissed';
  priority:      'high' | 'medium' | 'low';
  title:         string;
  body:          string;
  notes:         string | null;
  due_date:      string | null;
  snoozed_until: string | null;
  snapshot_id:   number | null;
  assigned_to:   string | null;
  completed_at:  string | null;
  completed_by:  string | null;
  created_at:    string;
  expires_at:    string | null;
  // subject
  contact_id:    number | null;
  contact_name:  string | null;
  contact_prefix: string | null;
  client_id:     number | null;
  client_name:   string | null;
  client_prefix: string | null;
  subject_name:  string | null;
  subject_prefix: string | null;
}

interface ListPulsesParams {
  contact_id?:  number;
  client_id?:   number;
  status?:      'open' | 'snoozed' | 'done' | 'dismissed';
  origin?:      'system' | 'manual';
  pulse_type?:  string;
  limit?:       number;
  offset?:      number;
}

interface ListPulsesResult {
  pulses: PulseItem[];
  total:  number;
  recipe: 'pulse-list';
}

export async function list_pulses(
  params: ListPulsesParams,
  ctx: SkillContext
): Promise<ListPulsesResult> {
  const limit  = Math.min(params.limit  ?? 50, 200);
  const offset = params.offset ?? 0;

  const qp = {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $status:      params.status      ?? null,
    $origin:      params.origin      ?? null,
    $pulse_type:  params.pulse_type  ?? null,
    $contact_id:  params.contact_id  ?? null,
    $client_id:   params.client_id   ?? null,
    $limit:       limit,
    $offset:      offset,
  };

  const [dataRes, countRes] = await Promise.all([
    ctx.db.query<PulseItem>(LIST_SQL, qp),
    ctx.db.query<{ total: string }>(COUNT_SQL, {
      $tenant_id:  qp.$tenant_id,
      $is_live:    qp.$is_live,
      $status:     qp.$status,
      $origin:     qp.$origin,
      $pulse_type: qp.$pulse_type,
      $contact_id: qp.$contact_id,
      $client_id:  qp.$client_id,
    }),
  ]);

  return {
    pulses: dataRes.rows,
    total:  Number(countRes.rows[0]?.total ?? 0),
    recipe: 'pulse-list',
  };
}
