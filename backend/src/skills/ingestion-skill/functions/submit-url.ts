/**
 * ingestion-skill: submit_url — point VaNi at a page. Re-submitting the same
 * URL re-ingests it (fresh crawl) rather than stacking a second source row.
 * Emits URL_SUBMITTED; the worker's ingestion agent does the rest.
 */
import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db';
import { emitEvent } from '../../../agent-core/event.store';
import { parsePublicUrl } from './_sources';

export async function submit_url(params: { url: string }, ctx: SkillContext) {
  const parsed = parsePublicUrl(params.url);
  const sourceId = await ctx.db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      `SELECT id FROM gt_kb_sources WHERE tenant_id = $tenant_id AND source_type = 'url' AND url = $url`,
      { tenant_id: ctx.tenant_id, url: parsed.href },
    );
    if (existing.rows[0]) {
      await tx.query(
        `UPDATE gt_kb_sources SET status = 'pending', error_msg = NULL, updated_at = now()
          WHERE id = $id AND tenant_id = $tenant_id`,
        { id: existing.rows[0].id, tenant_id: ctx.tenant_id },
      );
      return existing.rows[0].id;
    }
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO gt_kb_sources (tenant_id, source_type, display_name, url, status)
       VALUES ($tenant_id, 'url', $display_name, $url, 'pending') RETURNING id`,
      { tenant_id: ctx.tenant_id, display_name: parsed.hostname, url: parsed.href },
    );
    return inserted.rows[0].id;
  });
  await emitEvent(getPool(), ctx.tenant_id, 'URL_SUBMITTED', 'human', { source_id: sourceId, url: parsed.href });
  return { source_id: sourceId, url: parsed.href, recipe: 'source-detail' };
}
