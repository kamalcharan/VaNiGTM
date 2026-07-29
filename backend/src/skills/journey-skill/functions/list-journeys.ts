/**
 * journey-skill: list_journeys
 *
 * The board. Every journey in one state, plus the count behind every other
 * state so the counts themselves are the navigation.
 *
 * Each row carries what it is OWED (states.OWED) rather than only what it
 * is. "qualified" is a status; "find the person" is a thing somebody can do
 * this afternoon, and the difference is whether the board gets worked.
 */

import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../shared/types';
import { STATES, OWED, isState, type JourneyState } from '../states';

const QUERIES = path.resolve(__dirname, '..', 'queries');
const sql = (f: string) => fs.readFileSync(path.join(QUERIES, f), 'utf8');

interface ListJourneysParams {
  state?: string;
  arc?: string;
  owner_id?: string;
  /** Parked journeys whose wake date has passed. */
  due?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

interface CountRow { state: string; n: string; due: string }

export async function list_journeys(params: ListJourneysParams, ctx: SkillContext) {
  const state = String(params.state ?? '').trim();
  // A filter that silently does nothing shows the unfiltered list, which
  // reads as "every journey is in this state".
  if (state && !isState(state)) {
    throw new Error(`Unknown journey state "${state}". One of: ${STATES.join(', ')}`);
  }
  const arc = String(params.arc ?? '').trim();
  if (arc && arc !== 'acquisition' && arc !== 'lifetime') {
    throw new Error('arc must be "acquisition" or "lifetime"');
  }

  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
  const offset = Math.max(Number(params.offset) || 0, 0);

  const rows = await ctx.db.query<Record<string, unknown>>(sql('list-journeys.sql'), {
    tenant_id: ctx.tenant_id,
    is_live: ctx.is_live,
    state: state || null,
    arc: arc || null,
    owner_id: params.owner_id || null,
    due: params.due === true,
    search: String(params.search ?? '').trim() || null,
    limit,
    offset,
  });

  const counts = await ctx.db.query<CountRow>(sql('journey-counts.sql'), {
    tenant_id: ctx.tenant_id, is_live: ctx.is_live, arc: arc || null,
  });

  // Every state appears, including the empty ones. A state that vanishes
  // when it hits zero is a state nobody notices has emptied.
  const byState = Object.fromEntries(
    STATES.map((s) => {
      const row = counts.rows.find((c) => c.state === s);
      return [s, { n: Number(row?.n ?? 0), due: Number(row?.due ?? 0), owed: OWED[s] }];
    }),
  );

  return {
    journeys: rows.rows.map((r) => ({
      ...r,
      owed: OWED[r.state as JourneyState] ?? null,
    })),
    counts: byState,
    total: Object.values(byState).reduce((a, b) => a + b.n, 0),
    limit,
    offset,
    recipe: 'journey-board' as const,
  };
}
