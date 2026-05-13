/**
 * VaNi Profile Agent
 *
 * Triggered by:
 *   - TENANT_REGISTERED  → opens conversation, sets run to 'awaiting'
 *   - HUMAN_APPROVED     → finalises profile, emits PROFILE_COMPLETE
 *
 * Conversation turns (between trigger and approval) come in through the
 * REST route POST /api/v1/vani/gather, which calls conversationTurn().
 *
 * Reads:  gt_prompts (vani-skill.gather), gt_tenant_context.knowledge
 * Writes: gt_tenant_context, gt_kg_nodes, gt_agent_runs (via runner)
 * Emits:  PROFILE_COMPLETE on human approval
 */

import type { Pool } from 'pg';
import { createTenantDb } from '../../db';
import { appendStep, setStatus, getRuns } from '../../agent-core/agent.runner';
import { loadPrompt } from '../../agent-core/prompt.store';
import { callLLM } from '../../agent-core/llm.client';
import { emitEvent } from '../../agent-core/event.store';
import {
  ensureTenantContext,
  mergeAgentKnowledge,
  mergeProfile,
} from '../../agent-core/context.store';
import { upsertNode, countNodes, getNodes, type ExtractedNode } from '../../agent-core/kg.store';
import { upsertProfile, type TenantProfile } from '../profile-skill/profile.service';

const PROMPT_KEY = 'vani-skill.gather';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface VaniKnowledge {
  status?: 'gathering' | 'ready_for_review' | 'approved';
  conversation?: ConversationMessage[];
  run_id?: string;
  node_count?: number;
  approved_at?: string;
}

export interface ConversationTurnResult {
  reply: string;
  extractedNodes: ExtractedNode[];
  isReady: boolean;
}

export class VaniAgent {

  // ── TRIGGER: New tenant registered ───────────────────────────────────────

  static async handleTenantRegistered(
    pool: Pool,
    tenantId: string,
    _payload: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    // Ensure shared context row exists.
    await ensureTenantContext(pool, tenantId);

    await appendStep(pool, runId, {
      step_name: 'init_context',
      action:    'Created tenant context row',
      status:    'ok',
    });

    // Load opening system prompt.
    const systemPrompt = await loadPrompt(pool, PROMPT_KEY, tenantId);

    // Generate opening question. The LLM may emit <extract> tags here too
    // (rare on the very first turn) — we strip them from the reply.
    const result = await callLLM({
      tenantId,
      pool,
      runId,
      system:   systemPrompt,
      messages: [{ role: 'user', content: 'START_CONVERSATION' }],
      maxTokens: 400,
    });

    const openingMessage = stripTags(result.text);

    // Persist the opening message so the UI can render it on first load.
    await mergeAgentKnowledge(pool, tenantId, 'vani-skill', {
      status:       'gathering',
      conversation: [{ role: 'assistant', content: openingMessage }],
      run_id:       runId,
    }, 'vani-skill');

    // Run goes 'awaiting' — the tenant must respond via POST /vani/gather.
    await setStatus(pool, runId, 'awaiting', {
      awaiting_input: {
        type:    'input',
        prompt:  openingMessage,
        context: 'profile_gathering',
      },
    });

    await appendStep(pool, runId, {
      step_name:      'await_tenant_input',
      action:         'Opening question sent to tenant',
      output_summary: openingMessage.slice(0, 100),
      status:         'ok',
    });
  }

  // ── TURN: tenant message → reply + extracted nodes ──────────────────────

  static async conversationTurn(
    pool: Pool,
    tenantId: string,
    runId: string,
    userMessage: string,
  ): Promise<ConversationTurnResult> {
    const db = createTenantDb(pool, tenantId);

    // Load conversation history from context.
    const ctxResult = await db.query<{ knowledge: Record<string, VaniKnowledge> }>(
      `SELECT knowledge FROM gt_tenant_context WHERE tenant_id = $tenant_id`,
      { tenant_id: tenantId },
    );

    const vaniKnowledge: VaniKnowledge =
      ctxResult.rows[0]?.knowledge?.['vani-skill'] ?? { conversation: [] };
    const history = vaniKnowledge.conversation ?? [];

    // Load system prompt (tenant override possible).
    const systemPrompt = await loadPrompt(pool, PROMPT_KEY, tenantId);

    // Keep the last 20 turns to bound context length.
    const messages: ConversationMessage[] = [
      ...history,
      { role: 'user' as const, content: userMessage },
    ].slice(-20);

    const result = await callLLM({
      tenantId,
      pool,
      runId,
      system: systemPrompt,
      messages,
      maxTokens: 600,
    });

    const raw = result.text;
    const extractedNodes = parseExtractTags(raw);
    const isReady = /<profile_ready\s*\/?>/i.test(raw);
    const reply = stripTags(raw);

    // Persist each extracted node. Failures are logged but do not abort
    // the turn — the tenant still sees the reply.
    for (const node of extractedNodes) {
      try {
        await upsertNode(pool, tenantId, node, runId);
      } catch (err) {
        console.warn(`[VaNi] Node upsert failed for ${node.label}/${node.name}:`, err);
      }
    }

    // Update knowledge: extend conversation, refresh status + node_count.
    const updatedConversation: ConversationMessage[] = [
      ...history,
      { role: 'user'      as const, content: userMessage },
      { role: 'assistant' as const, content: reply },
    ].slice(-30);

    const nodeCount = await countNodes(pool, tenantId);

    await mergeAgentKnowledge(pool, tenantId, 'vani-skill', {
      ...vaniKnowledge,
      status:       isReady ? 'ready_for_review' : 'gathering',
      conversation: updatedConversation,
      run_id:       runId,
      node_count:   nodeCount,
    }, 'vani-skill');

    await appendStep(pool, runId, {
      step_name:      'conversation_turn',
      action:         `Turn completed. Extracted ${extractedNodes.length} nodes.`,
      input_summary:  userMessage.slice(0, 100),
      output_summary: reply.slice(0, 100),
      status:         'ok',
    });

    return { reply, extractedNodes, isReady };
  }

  // ── TRIGGER: Human approved profile ──────────────────────────────────────

  static async handleHumanApproved(
    pool: Pool,
    tenantId: string,
    _payload: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    await appendStep(pool, runId, {
      step_name: 'profile_approved',
      action:    'Human approved profile — building summary',
      status:    'ok',
    });

    // Fetch all nodes and build a grouped, deterministic summary.
    const nodes = await getNodes(pool, tenantId);

    const byLabel: Record<string, string[]> = {};
    for (const node of nodes) {
      const list = (byLabel[node.label] ||= []);
      list.push(`${node.name}: ${node.description ?? ''}`);
    }

    const profileSummary = Object.entries(byLabel)
      .map(([label, items]) => `${label}: ${items.join(' | ')}`)
      .join('\n');

    // Persist into the flat profile blob.
    await mergeProfile(pool, tenantId, {
      profile_summary:  profileSummary,
      profile_approved: true,
      approved_at:      new Date().toISOString(),
    }, 'vani-skill');

    await mergeAgentKnowledge(pool, tenantId, 'vani-skill', {
      status:      'approved',
      approved_at: new Date().toISOString(),
      node_count:  nodes.length,
    }, 'vani-skill');

    // ── MAP KG NODES → TENANT PROFILE ─────────
    // Walk the KG and project nodes into the typed gt_tenant_profile row.
    // The mapping is intentionally conservative — first node wins per field
    // so we don't overwrite a richer value with a thinner one. Arrays
    // (pain points, differentiators) accumulate.

    const profileFields: Partial<TenantProfile> = {};
    const painPoints:       string[] = [];
    const differentiators:  string[] = [];

    for (const node of nodes) {
      switch (node.label) {

        case 'Product':
          if (!profileFields.product_name) {
            profileFields.product_name = node.name;
          }
          if (!profileFields.product_description && node.description) {
            profileFields.product_description = node.description;
          }
          if (!profileFields.core_problem && node.properties?.core_problem) {
            profileFields.core_problem = String(node.properties.core_problem);
          }
          break;

        case 'PainPoint':
          painPoints.push(node.name);
          break;

        case 'ICP':
          if (!profileFields.icp_role) {
            profileFields.icp_role = node.name;
          }
          if (!profileFields.icp_company_type && node.description) {
            profileFields.icp_company_type = node.description;
          }
          if (node.properties?.industry) {
            profileFields.icp_industry = String(node.properties.industry);
          }
          break;

        case 'Differentiator':
          differentiators.push(node.name);
          break;

        case 'Team':
          if (node.properties?.headcount) {
            const n = parseInt(String(node.properties.headcount), 10);
            if (!isNaN(n)) profileFields.team_size = n;
          }
          break;

        case 'UseCase':
          if (!profileFields.product_description && node.description) {
            profileFields.product_description = node.description;
          }
          break;
      }
    }

    if (painPoints.length > 0) {
      profileFields.primary_pain_points = painPoints;
    }
    if (differentiators.length > 0) {
      profileFields.key_differentiators = differentiators;
    }

    // Upsert into the typed profile table (also records a history snapshot).
    const savedProfile = await upsertProfile(
      pool,
      tenantId,
      profileFields,
      'vani-skill',
      'Mapped from VaNi conversation KG nodes',
    );

    // Check minimum requirements for downstream agents to take over.
    const REQUIRED_FIELDS: (keyof TenantProfile)[] = [
      'product_name',
      'product_description',
      'core_problem',
      'icp_role',
    ];
    const missingFields = REQUIRED_FIELDS.filter((f) => !savedProfile[f]);
    const hasPainPoints = (savedProfile.primary_pain_points?.length ?? 0) >= 1;
    if (!hasPainPoints) missingFields.push('primary_pain_points');

    if (missingFields.length === 0 && savedProfile.is_complete) {
      // Profile complete — wake downstream agents and finalise the run.
      await emitEvent(
        pool,
        tenantId,
        'PROFILE_COMPLETE',
        'agent',
        {
          profile_id:       savedProfile.id,
          completion_score: savedProfile.completion_score,
          source:           'vani-skill',
        },
        runId,
      );

      await setStatus(pool, runId, 'completed', {
        output: {
          profile_id:       savedProfile.id,
          completion_score: savedProfile.completion_score,
          node_count:       nodes.length,
        },
      });

      await appendStep(pool, runId, {
        step_name: 'profile_complete',
        action:    `Profile complete (score: ${savedProfile.completion_score}). PROFILE_COMPLETE emitted.`,
        status:    'ok',
      });
    } else {
      // Profile incomplete — pause and ask the tenant to fill the gaps.
      await setStatus(pool, runId, 'awaiting', {
        awaiting_input: {
          type:           'input',
          prompt:         `Profile incomplete. Please fill in: ${missingFields.join(', ')}`,
          missing_fields: missingFields,
        },
      });

      await appendStep(pool, runId, {
        step_name: 'profile_incomplete',
        action:    `Profile incomplete. Missing: ${missingFields.join(', ')}. Run set to AWAITING.`,
        status:    'ok',
      });
    }
  }

  // ── Helper: find the most recent gathering run for a tenant ─────────────
  // Used by the REST route to look up the run when the UI calls /gather
  // without supplying a run_id explicitly.

  static async findActiveRunId(pool: Pool, tenantId: string): Promise<string | null> {
    // Most recent TENANT_REGISTERED run for this tenant.
    const runs = await getRuns(pool, tenantId, 'TENANT_REGISTERED', 1);
    return runs[0]?.id ?? null;
  }
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function stripTags(text: string): string {
  return text
    .replace(/<extract>[\s\S]*?<\/extract>/g, '')
    .replace(/<profile_ready\s*\/?>/gi, '')
    .trim();
}

function parseExtractTags(raw: string): ExtractedNode[] {
  const matches  = [...raw.matchAll(/<extract>([\s\S]*?)<\/extract>/g)];
  const nodes: ExtractedNode[] = [];

  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1]) as Partial<ExtractedNode>;
      if (
        parsed
        && typeof parsed.label       === 'string'
        && typeof parsed.name        === 'string'
        && typeof parsed.description === 'string'
      ) {
        nodes.push({
          label:       parsed.label,
          name:        parsed.name,
          description: parsed.description,
          properties:  (parsed.properties as Record<string, unknown>) ?? {},
        });
      }
    } catch {
      // Malformed JSON in an <extract> tag — skip it silently.
    }
  }

  return nodes;
}
