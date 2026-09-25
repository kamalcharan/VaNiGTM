/**
 * ingestion-skill: submit_text — pasted context (a brochure, a proposal, an
 * FAQ). Creates a txt source with raw_text pre-supplied and emits
 * FILE_UPLOADED; the agent skips fetching and goes straight to extraction.
 */
import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db';
import { emitEvent } from '../../../agent-core/event.store';
import { MAX_TEXT_CHARS, MIN_TEXT_CHARS } from './_sources';

export async function submit_text(params: { text: string; title?: string }, ctx: SkillContext) {
  const text = String(params.text ?? '').trim();
  const title = String(params.title ?? '').trim() || 'Pasted context';
  if (text.length < MIN_TEXT_CHARS) throw new Error(`TEXT_TOO_SHORT: Provide at least ${MIN_TEXT_CHARS} characters of context`);
  const clipped = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
  const sourceId = await ctx.db.transaction(async (tx) => {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO gt_kb_sources (tenant_id, source_type, display_name, raw_text, status)
       VALUES ($tenant_id, 'txt', $display_name, $raw_text, 'pending') RETURNING id`,
      { tenant_id: ctx.tenant_id, display_name: title.slice(0, 500), raw_text: clipped },
    );
    return inserted.rows[0].id;
  });
  await emitEvent(getPool(), ctx.tenant_id, 'FILE_UPLOADED', 'human', { source_id: sourceId });
  return { source_id: sourceId, recipe: 'source-detail' };
}
