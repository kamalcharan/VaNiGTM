/**
 * Storyteller Agent
 *
 * Turns an approved tenant profile (gt_tenant_profile + gt_kg_nodes) into a
 * validated deck (gt_presentations), approves it (mints share_token, emits
 * PRESENTATION_READY), and answers audience questions (gt_qa_log).
 *
 * SKELETON — Stage 3. All methods are stubs. No SQL, no LLM calls, no wiring.
 * Implementation lands in a later stage.
 *
 * Write-path rule: buildDeck / approveDeck / answerQuestion use createTenantDb
 * (tenant context for RLS). The public share route uses the raw pool.
 */

import type { Pool } from 'pg';
// Deck output contract (validated with DeckSchema in a later stage).
import type { Deck } from './deck.schema';

export class StorytellerAgent {

  /**
   * Manual + event entry point. Reads profile + KG, builds & persists a deck
   * at status='awaiting'. Returns the new presentation id.
   * Stage 4 will generate `Deck` via `vani-skill.generate_slides` + DeckSchema.
   */
  static async buildDeck(
    pool: Pool,
    tenantId: string,
    opts?: { sourceRunId?: number },
  ): Promise<{ presentationId: string }> {
    void pool; void tenantId; void opts;
    const _deck: Deck | null = null;   // placeholder — validated deck built in Stage 4
    void _deck;
    throw new Error('NOT_IMPLEMENTED: buildDeck');
  }

  /**
   * Flip a deck awaiting → approved, mint its share_token, emit
   * PRESENTATION_READY. Returns the share token.
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
   * to gt_qa_log. Returns the answer text.
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
