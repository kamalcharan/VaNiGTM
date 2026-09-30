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

import { randomBytes } from 'crypto';
import type { Pool } from 'pg';
import { createTenantDb } from '../../db';
import { brainContext } from '../../agent-core/brain.context';
import { loadPrompt } from '../../agent-core/prompt.store';
import { callLLM, callLLMValidated } from '../../agent-core/llm.client';
import { emitEvent } from '../../agent-core/event.store';
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
    // STEP 1 + 2 — load the seeded prompt, then read the Brain through
    // brain.context (purpose `deck`): the whole profile and every graph node,
    // trimmed from the end to what is left of the window after the prompt
    // and the answer — the same text the storyteller built for itself before.
    const system = await loadPrompt(pool, PROMPT_KEY, tenantId);
    const MAX_OUTPUT = 2000;
    const brain = await brainContext(pool, tenantId, {
      purpose: 'deck', reserveOutputTokens: MAX_OUTPUT, fixedText: system,
    });
    const profile = brain.data.profile!;   // brainContext throws PROFILE_NOT_FOUND otherwise
    const context = brain.text;

    const deck: Deck = await callLLMValidated(
      {
        tenantId,
        pool,
        runId: opts?.sourceRunId ?? 0,   // required by LLMCallOptions; unused by callLLM
        system,
        messages: [{ role: 'user', content: context }],
        maxTokens: MAX_OUTPUT,
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
    // URL-safe token, no padding — generated before the write.
    const shareToken = randomBytes(24).toString('base64url');

    const db = createTenantDb(pool, tenantId);
    const result = await db.query<{ share_token: string }>(
      `UPDATE gt_presentations
          SET status = 'approved', share_token = $share_token, approved_at = NOW()
        WHERE id = $id AND tenant_id = $tenant_id AND status = 'awaiting'
        RETURNING share_token`,
      { share_token: shareToken, id: presentationId, tenant_id: tenantId },
    );

    if (!result.rows[0]) {
      throw new Error('DECK_NOT_APPROVABLE: not found, not yours, or already approved');
    }

    // Wake downstream — mirror how vani.agent emits PROFILE_COMPLETE.
    await emitEvent(
      pool,
      tenantId,
      'PRESENTATION_READY',
      'agent',
      {
        presentation_id: presentationId,
        tenant_id:       tenantId,
        share_token:     shareToken,
      },
    );

    return { shareToken };
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
    const db = createTenantDb(pool, tenantId);

    // Load the deck (tenant-scoped).
    const deckRow = await db.query<{ slides: unknown }>(
      `SELECT slides FROM gt_presentations
        WHERE id = $id AND tenant_id = $tenant_id`,
      { id: presentationId, tenant_id: tenantId },
    );
    if (!deckRow.rows[0]) {
      throw new Error('PRESENTATION_NOT_FOUND: deck not found');
    }
    const slides = deckRow.rows[0].slides;

    // Grounded answer — free text, so callLLM (not callLLMValidated).
    const system = await loadPrompt(pool, 'vani-skill.answer_question', tenantId);
    const result = await callLLM({
      tenantId,
      pool,
      runId: 0,   // required by LLMCallOptions; unused by callLLM
      system,
      messages: [{
        role: 'user',
        content: `DECK:\n${JSON.stringify(slides)}\n\nQUESTION: ${question}`,
      }],
      maxTokens: 400,
      temperature: 0.3,
    });
    const answer = result.text;

    // Log the exchange (tenant-scoped).
    await db.query(
      `INSERT INTO gt_qa_log (tenant_id, presentation_id, question, answer)
       VALUES ($tenant_id, $presentation_id, $question, $answer)`,
      {
        tenant_id:       tenantId,
        presentation_id: presentationId,
        question,
        answer,
      },
    );

    return { answer };
  }
}
