/**
 * assessment-skill: get_lead
 *
 * Single lead with everything the console's detail screen renders: the
 * assessment result, the respondent's answers as READABLE text, the frozen
 * mode profile, the report token, and the event timeline.
 *
 * Answers are stored as {question_id: option_index} (never the score — see
 * scoring.ts), so they are meaningless without the definition. This
 * function does that mapping server-side rather than shipping the
 * definition to the browser and zipping it there, which keeps every piece
 * of assessment copy out of the frontend.
 *
 * Partner role can only fetch their own leads — the $partner_id filter in
 * get-lead.sql returns zero rows for anyone else's lead, so this reports
 * LEAD_NOT_FOUND rather than distinguishing "does not exist" from "not
 * yours". That is deliberate: telling a partner a lead exists but is
 * someone else's is itself a disclosure.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { resolvePartnerContext } from '../partner-context';

const GET_LEAD_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-lead.sql'), 'utf-8');
const GET_TIMELINE_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-lead-timeline.sql'), 'utf-8');

interface GetLeadParams {
  lead_id: string;
}

interface DefinitionQuestion {
  id: string;
  text: string;
  context_only?: boolean;
  options: Array<{ label: string }>;
}

interface AnsweredQuestion {
  question_id: string;
  question_text: string;
  option_letter: string;
  option_label: string;
  context_only: boolean;
}

/** Zips stored answer indexes against the definition into readable rows. */
function renderAnswers(
  definition: { questions?: DefinitionQuestion[] } | null,
  answers: Record<string, number> | null,
): AnsweredQuestion[] {
  if (!definition?.questions || !answers) return [];
  const out: AnsweredQuestion[] = [];
  for (const q of definition.questions) {
    const idx = answers[q.id];
    if (idx === undefined || idx === null) continue;
    const opt = q.options?.[idx];
    // An index the definition no longer has (edited in place after the fact)
    // is shown as-is rather than dropped — a missing answer would read as
    // "they never answered", which is a different and wrong claim.
    out.push({
      question_id: q.id,
      question_text: q.text,
      option_letter: 'ABCDEFGH'[idx] ?? String(idx),
      option_label: opt?.label ?? `(option ${idx} no longer in the definition)`,
      context_only: q.context_only ?? false,
    });
  }
  return out;
}

export async function get_lead(params: GetLeadParams, ctx: SkillContext) {
  if (!params.lead_id) throw new Error('lead_id is required');
  const access = await resolvePartnerContext(ctx);

  const leadResult = await ctx.db.query<any>(GET_LEAD_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $lead_id: params.lead_id,
    $partner_id: access.role === 'partner' ? access.partnerRowId : null,
  });
  const row = leadResult.rows[0];
  if (!row) throw new Error('LEAD_NOT_FOUND');

  const timelineResult = await ctx.db.query(GET_TIMELINE_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $lead_id: params.lead_id,
  });

  const { definition, answers, ...lead } = row;

  return {
    lead: {
      ...lead,
      // Report link is a bearer capability — the console shows it because
      // the operator is entitled to it, same page the prospect gets.
      report_url: row.report_token ? `/r/${row.report_token}` : null,
    },
    responses: renderAnswers(definition, answers),
    timeline: timelineResult.rows,
    recipe: 'lead-detail',
  };
}
