/**
 * Storyteller Agent
 *
 * Turns an approved tenant profile (gt_tenant_profile + gt_kg_nodes) into a
 * validated deck (gt_presentations), approves it (mints share_token, emits
 * PRESENTATION_READY), and answers audience questions (gt_qa_log).
 *
 * Stage 4: buildDeck is implemented. approveDeck / answerQuestion remain stubs
 * (Stage 5). Write-path rule: buildDeck writes via createTenantDb (tenant
 * context for RLS). The public share route uses the raw pool.
 */

import type { Pool } from 'pg';
import { createTenantDb } from '../../db';
import { getProfile, type TenantProfile } from '../profile-skill/profile.service';
import { getNodes, type KGNode } from '../../agent-core/kg.store';
import { loadPrompt } from '../../agent-core/prompt.store';
import { callLLMValidated } from '../../agent-core/llm.client';
import { DeckSchema, type Deck } from './deck.schema';

// Seeded prompt, reused as-is (namespace is vani-skill.*, not re-keyed).
const PROMPT_KEY = 'vani-skill.generate_slides';

// Canonical deck order — the model may return slides out of order.
const SLIDE_ORDER = ['title', 'problem', 'solution', 'icp', 'differentiators', 'traction', 'cta'];

export class StorytellerAgent {

  /**
   * Manual + event entry point. Reads profile + KG, generates a validated deck
   * via `vani-skill.generate_slides`, and persists it at status='awaiting'.
   */
  static async buildDeck(
    pool: Pool,
    tenantId: string,
    opts?: { sourceRunId?: number },
  ): Promise<{ presentationId: string }> {
    // STEP 1 — load inputs. Profile is required; nodes may be empty (thin deck,
    // not a crash).
    const profile = await getProfile(pool, tenantId);
    if (!profile) {
      throw new Error('PROFILE_NOT_FOUND: cannot build deck without a profile');
    }
    const nodes = await getNodes(pool, tenantId);

    // STEP 2 + 3 — load the seeded prompt and generate a validated deck.
    const system = await loadPrompt(pool, PROMPT_KEY, tenantId);
    const deck: Deck = await callLLMValidated(
      {
        tenantId,
        pool,
        runId: opts?.sourceRunId ?? 0,   // required by LLMCallOptions; unused by callLLM
        system,
        messages: [{ role: 'user', content: serializeContext(profile, nodes) }],
        maxTokens: 2000,                 // headroom under the ~4096 context budget
        temperature: 0.4,                // storytelling, still JSON-stable
      },
      DeckSchema,
    );
    // callLLMValidated already appends /no_think, strips fences, parses, retries
    // ONCE, else throws LLM_VALIDATION_FAILED. Not caught here — let it propagate
    // so no half-row is written; the caller (Stage 5 route / Stage 6 worker)
    // records the failure.

    // STEP 4 — normalize slide order (schema is lenient).
    deck.sort((a, b) => SLIDE_ORDER.indexOf(a.type) - SLIDE_ORDER.indexOf(b.type));

    // STEP 5 — persist ONE row via createTenantDb (tenant context set → RLS
    // passes). Same acquire/set-context/query/release pattern vani.agent uses.
    const title = profile.product_name
      ? `${profile.product_name} — pitch`
      : (deck[0]?.title ?? 'Untitled deck');

    const db = createTenantDb(pool, tenantId);
    const result = await db.query<{ id: string }>(
      `INSERT INTO gt_presentations (tenant_id, source_run_id, title, slides, status)
       VALUES ($tenant_id, $source_run_id, $title, $slides::jsonb, 'awaiting')
       RETURNING id`,
      {
        tenant_id:     tenantId,
        source_run_id: opts?.sourceRunId ?? null,
        title,
        slides:        JSON.stringify(deck),
      },
    );

    // STEP 6
    return { presentationId: result.rows[0].id };
  }

  /**
   * Flip a deck awaiting → approved, mint its share_token, emit
   * PRESENTATION_READY. Returns the share token. (Stage 5)
   */
  static async approveDeck(
    pool: Pool,
    tenantId: string,
    presentationId: string,
  ): Promise<{ shareToken: string }> {
    void pool; void tenantId; void presentationId;
    throw new Error('NOT_IMPLEMENTED: approveDeck');
  }

  /**
   * Answer an audience question grounded in the deck + KG. Logs the exchange
   * to gt_qa_log. Returns the answer text. (Stage 5)
   */
  static async answerQuestion(
    pool: Pool,
    tenantId: string,
    presentationId: string,
    question: string,
  ): Promise<{ answer: string }> {
    void pool; void tenantId; void presentationId; void question;
    throw new Error('NOT_IMPLEMENTED: answerQuestion');
  }
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/**
 * Serialize profile + KG into a lean plain-text block for the prompt.
 * Skips null/empty fields and omits a section header when the whole section is
 * empty. Kept compact — the total context budget is ~4096 tokens.
 */
function serializeContext(profile: TenantProfile, nodes: KGNode[]): string {
  const sections: string[] = [];

  // trimmed scalar, or null if empty
  const s = (v: string | null | undefined): string | null => {
    const t = (v ?? '').toString().trim();
    return t.length ? t : null;
  };
  // TEXT[] joined with ', ', or null if empty
  const list = (a: string[] | null | undefined): string | null => {
    if (!a || a.length === 0) return null;
    const joined = a.map((x) => (x ?? '').trim()).filter((x) => x.length).join(', ');
    return joined.length ? joined : null;
  };
  // join present labelled parts with a separator, or null if none
  const inline = (parts: (string | null)[]): string | null => {
    const kept = parts.filter((p): p is string => !!p);
    return kept.length ? kept.join('  |  ') : null;
  };

  // PRODUCT
  {
    const lines: string[] = [];
    const head = inline([
      s(profile.product_name)     && `Name: ${s(profile.product_name)}`,
      s(profile.product_tagline)  && `Tagline: ${s(profile.product_tagline)}`,
      s(profile.product_category) && `Category: ${s(profile.product_category)}`,
    ]);
    if (head) lines.push(head);
    if (s(profile.product_description)) lines.push(`Description: ${s(profile.product_description)}`);
    if (s(profile.core_problem))        lines.push(`Core problem: ${s(profile.core_problem)}`);
    if (list(profile.key_differentiators)) lines.push(`Differentiators: ${list(profile.key_differentiators)}`);
    const pricing = [s(profile.pricing_model), s(profile.pricing_range)].filter(Boolean).join(' / ');
    if (pricing) lines.push(`Pricing: ${pricing}`);
    if (lines.length) sections.push(`PRODUCT\n${lines.join('\n')}`);
  }

  // IDEAL CUSTOMER
  {
    const lines: string[] = [];
    const company = [s(profile.icp_company_type), s(profile.icp_company_size), s(profile.icp_industry)]
      .filter(Boolean).join(', ');
    const head = inline([
      s(profile.icp_role)      && `Role: ${s(profile.icp_role)}`,
      company                  ? `Company: ${company}` : null,
      s(profile.icp_geography) && `Geography: ${s(profile.icp_geography)}`,
    ]);
    if (head) lines.push(head);
    if (list(profile.primary_pain_points)) lines.push(`Pain points: ${list(profile.primary_pain_points)}`);
    if (lines.length) sections.push(`IDEAL CUSTOMER\n${lines.join('\n')}`);
  }

  // GO-TO-MARKET
  {
    const head = inline([
      s(profile.gtm_stage)          && `Stage: ${s(profile.gtm_stage)}`,
      list(profile.active_channels) && `Channels: ${list(profile.active_channels)}`,
      s(profile.current_mrr)        && `MRR: ${s(profile.current_mrr)}`,
      profile.team_size != null ? `Team: ${profile.team_size}` : null,
    ]);
    if (head) sections.push(`GO-TO-MARKET\n${head}`);
  }

  // VISION
  {
    const head = inline([
      s(profile.vision_statement)   && `Statement: ${s(profile.vision_statement)}`,
      s(profile.target_market_size) && `Market size: ${s(profile.target_market_size)}`,
    ]);
    if (head) sections.push(`VISION\n${head}`);
  }

  // KNOWLEDGE GRAPH — one line per node; omit null description.
  {
    const lines = nodes.map((n) => {
      const d = s(n.description);
      return `[${n.label}] ${n.name}${d ? ` — ${d}` : ''}`;
    });
    if (lines.length) sections.push(`KNOWLEDGE GRAPH\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
