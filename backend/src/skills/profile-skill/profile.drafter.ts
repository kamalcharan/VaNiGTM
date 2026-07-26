/**
 * Profile drafter — turns raw website text into a drafted GTM profile.
 *
 * Called by the ingestion agent right after a URL source is parsed, so the
 * onboarding wizard's "research my company" step produces a substantive
 * company card instead of waiting on indirect KG→profile mapping.
 *
 * Fill-only-empty: drafted values NEVER overwrite fields the tenant (or a
 * previous draft) already set — re-crawling a site cannot clobber human
 * edits. The prompt lives inline for now; move to gt_prompts when tenants
 * need per-tenant overrides.
 */

import { z } from 'zod';
import type { Pool } from 'pg';
import { callLLMValidated } from '../../agent-core/llm.client';
import { getProfile, upsertProfile, type TenantProfile } from './profile.service';

/* ── Draft schema — everything optional; the model fills what it can ───── */

const nonEmpty = (v: unknown) =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;

const DraftSchema = z.object({
  product_name:        z.preprocess(nonEmpty, z.string().max(200).optional()),
  product_tagline:     z.preprocess(nonEmpty, z.string().max(300).optional()),
  product_category:    z.preprocess(nonEmpty, z.string().max(200).optional()),
  product_description: z.preprocess(nonEmpty, z.string().max(2000).optional()),
  core_problem:        z.preprocess(nonEmpty, z.string().max(2000).optional()),
  key_differentiators: z.array(z.string().min(1).max(300)).max(8).optional(),
  icp_role:            z.preprocess(nonEmpty, z.string().max(200).optional()),
  icp_company_type:    z.preprocess(nonEmpty, z.string().max(300).optional()),
  icp_industry:        z.preprocess(nonEmpty, z.string().max(300).optional()),
  primary_pain_points: z.array(z.string().min(1).max(300)).max(8).optional(),
});

export type ProfileDraft = z.infer<typeof DraftSchema>;

const SYSTEM_PROMPT = `You are VaNi, a go-to-market analyst. You are given the plain text of a company's website. Extract that company's GTM profile.

Respond with ONLY a JSON object inside <profile></profile> tags. Use exactly these keys (omit any key you cannot determine from the text — never invent facts):

<profile>
{
  "product_name": "the product or company name",
  "product_tagline": "their one-line pitch, close to their own words",
  "product_category": "the product category, e.g. 'CRM for field teams'",
  "product_description": "2-3 sentences: what the product does and for whom",
  "core_problem": "the customer problem it solves, 1-2 sentences",
  "key_differentiators": ["up to 5 short phrases they claim as differentiators"],
  "icp_role": "the buyer role they target, e.g. 'VP Marketing'",
  "icp_company_type": "the kind of company they sell to, e.g. 'B2B SaaS, 50-500 employees'",
  "icp_industry": "the industry vertical if one is clear",
  "primary_pain_points": ["up to 5 short customer pain statements the site speaks to"]
}
</profile>

Ground every value in the provided text. Short and concrete beats long and vague. No markdown, no commentary — only the tagged JSON.`;

/* ── Draft + merge (fill only empty fields) ─────────────────────────────── */

export interface DraftResult {
  fieldsFilled: string[];
  fieldsSkipped: string[];
  profile: TenantProfile;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export async function draftProfileFromText(
  pool: Pool,
  tenantId: string,
  rawText: string,
  runId: string,
): Promise<DraftResult> {
  // The homepage's first ~24k chars carry the positioning; keep the LLM
  // call well inside small-model context limits.
  const text = rawText.slice(0, 24_000);

  const draft = await callLLMValidated(
    {
      pool,
      tenantId,
      runId,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Website text:\n\n${text}` }],
      maxTokens: 1200,
      temperature: 0.2,
    },
    DraftSchema,
    'profile',
  );

  const existing = await getProfile(pool, tenantId);

  const fieldsFilled: string[] = [];
  const fieldsSkipped: string[] = [];
  const fill: Partial<TenantProfile> = {};

  for (const [key, value] of Object.entries(draft)) {
    if (value === undefined) continue;
    if (existing && !isEmpty(existing[key as keyof TenantProfile])) {
      fieldsSkipped.push(key);
      continue;
    }
    (fill as Record<string, unknown>)[key] = value;
    fieldsFilled.push(key);
  }

  if (fieldsFilled.length === 0) {
    return {
      fieldsFilled,
      fieldsSkipped,
      profile: existing ?? await upsertProfile(pool, tenantId, { source: 'vani' }, 'vani', 'website research (no new fields)'),
    };
  }

  fill.source = 'vani';
  const profile = await upsertProfile(pool, tenantId, fill, 'vani', 'drafted from website research');
  return { fieldsFilled, fieldsSkipped, profile };
}
