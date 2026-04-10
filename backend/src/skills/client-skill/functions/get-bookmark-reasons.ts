/**
 * client-skill: get_bookmark_reasons
 * Returns the active bookmark reason master data for this tenant + environment.
 * Used to populate the reason picker in the bookmark modal.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_BOOKMARK_REASONS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-bookmark-reasons.sql'), 'utf-8'
);

interface BookmarkReason {
  id: number;
  reason_code: string;
  reason_label: string;
  display_order: number;
}

interface GetBookmarkReasonsResult {
  reasons: BookmarkReason[];
  recipe: 'option-list';
}

export async function get_bookmark_reasons(
  _params: Record<string, never>,
  ctx: SkillContext
): Promise<GetBookmarkReasonsResult> {
  const res = await ctx.db.query<BookmarkReason>(GET_BOOKMARK_REASONS_SQL, {
    $tenant_id: ctx.tenant_id,
  });

  return {
    reasons: res.rows,
    recipe: 'option-list',
  };
}
