# Vikuna GTM — Agent Infrastructure Spec
## Version 1.1 · May 2026 · Status: Ready for Claude Code

---

## 0. OVERVIEW

This spec covers two things built together:
1. **`agent-core/`** — reusable infrastructure every future agent uses
2. **`vani-skill/`** — the Profile Agent, first agent in the system

Every future agent (ICP, Lead Finder, Sequence, Pulse) will follow this exact pattern.
Build `agent-core` once. Build `vani-skill` as the reference implementation.

---

## 1. WHAT CLAUDE CODE MUST READ FIRST

Before writing a single line, read these files in order:

```
backend/src/server.ts                          ← how routes are mounted
backend/src/db/pool.ts                         ← singleton pool pattern
backend/src/db/query.ts                        ← translateParams, createTenantDb
backend/src/types/skill.types.ts               ← SkillContext, SkillDb interfaces
backend/src/auth/token.service.ts              ← extractJwt pattern
backend/src/skills/client-skill/              ← reference skill (read all files)
backend/migrations/001_vn_foundation.sql       ← vn_tenants, vn_users table names
backend/migrations/ (scan all)                 ← find highest migration number
backend/src/services/                          ← skill-registry, skill-loader pattern
```

**Critical things to confirm before writing:**
- Exact column name for tenant ID on `vn_users` (likely `tenant_id`)
- Exact name of tenants table (likely `vn_tenants`)
- Highest existing migration number (new migrations start from N+1)
- How `SkillContext` is typed — use exact same interface
- How `extractJwt` is called in route handlers — copy exact pattern

---

## 2. MIGRATIONS

### Migration N+1: `gt_agent_infrastructure.sql`

Prefix: `gt_` (confirmed)

```sql
-- ═══════════════════════════════════════════════════════════════
-- AGENT INFRASTRUCTURE TABLES
-- ═══════════════════════════════════════════════════════════════

-- ── EVENT BUS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  event_type      VARCHAR(80) NOT NULL,
  -- USER_ACTION | AGENT_COMPLETED | AGENT_FAILED | SCHEDULED |
  -- WEBHOOK_RECEIVED | FILE_INGESTED | HUMAN_APPROVED | HUMAN_REJECTED
  source_type     VARCHAR(30) NOT NULL,
  -- 'human' | 'agent' | 'cron' | 'system' | 'webhook'
  source_id       UUID,
  -- user_id if human, agent_run_id if agent, null if cron/system
  payload         JSONB       NOT NULL DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'processing' | 'done' | 'failed'
  processed_at    TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gt_events_polling
  ON gt_events (tenant_id, status, created_at)
  WHERE status = 'pending';

CREATE INDEX idx_gt_events_tenant_type
  ON gt_events (tenant_id, event_type, created_at DESC);

-- ── TENANT CONTEXT (shared memory) ────────────────────────────
CREATE TABLE IF NOT EXISTS gt_tenant_context (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        UNIQUE NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

  -- PHASE 1 FIELDS
  profile         JSONB       NOT NULL DEFAULT '{}',
  -- { product_name, product_description, icp_summary,
  --   gtm_stage, channels[], pricing_model, team_size }
  knowledge       JSONB       NOT NULL DEFAULT '{}',
  -- keyed by agent: { "vani-skill": {...}, "icp-skill": {...} }
  flags           JSONB       NOT NULL DEFAULT '{}',
  -- onboarding steps, feature flags, agent run counts
  daily_token_usage JSONB     NOT NULL DEFAULT '{}',
  -- { "2026-05-12": { input: 12400, output: 3200, cost_usd: 0.042 } }
  daily_token_limit INTEGER   NOT NULL DEFAULT 100000,
  -- default 100k tokens/day per tenant. Override per tenant.

  version         INTEGER     NOT NULL DEFAULT 1,
  updated_by      VARCHAR(80),
  -- 'vani-skill' | 'icp-skill' | user_id
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AGENT RUNS (extend existing gt_agent_runs) ─────────────────
-- First check if gt_agent_runs exists. If yes, ALTER. If no, CREATE.
-- Claude Code: check migrations for existing gt_agent_runs definition.

ALTER TABLE gt_agent_runs
  ADD COLUMN IF NOT EXISTS event_id         UUID REFERENCES gt_events(id),
  ADD COLUMN IF NOT EXISTS agent_name       VARCHAR(80),
  -- 'vani-skill' | 'icp-skill' | 'lead-skill' etc
  ADD COLUMN IF NOT EXISTS steps            JSONB NOT NULL DEFAULT '[]',
  -- append-only: [{ts, step_name, action, input_summary,
  --                output_summary, duration_ms, status}]
  ADD COLUMN IF NOT EXISTS awaiting_input   JSONB,
  -- null when running, populated when AWAITING
  -- { type: 'approval'|'input', prompt: string, options: [] }
  ADD COLUMN IF NOT EXISTS retry_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checkpoint  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS output           JSONB,
  ADD COLUMN IF NOT EXISTS error_trace      TEXT,
  ADD COLUMN IF NOT EXISTS token_usage      JSONB DEFAULT '{}',
  -- { input_tokens, output_tokens, model, cost_usd }
  ADD COLUMN IF NOT EXISTS duration_ms      INTEGER;

-- If gt_agent_runs does NOT exist, create it:
CREATE TABLE IF NOT EXISTS gt_agent_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  event_id        UUID        REFERENCES gt_events(id),
  agent_name      VARCHAR(80) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'queued',
  -- 'queued' | 'running' | 'awaiting' | 'completed' | 'failed'
  steps           JSONB       NOT NULL DEFAULT '[]',
  awaiting_input  JSONB,
  retry_count     INTEGER     NOT NULL DEFAULT 0,
  last_checkpoint VARCHAR(100),
  output          JSONB,
  error_trace     TEXT,
  token_usage     JSONB       DEFAULT '{}',
  duration_ms     INTEGER,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gt_agent_runs_tenant
  ON gt_agent_runs (tenant_id, agent_name, status, created_at DESC);

CREATE INDEX idx_gt_agent_runs_event
  ON gt_agent_runs (event_id);

-- ── PROMPT VERSIONING ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt_prompts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        REFERENCES vn_tenants(id) ON DELETE CASCADE,
  -- NULL = system prompt (all tenants), UUID = tenant override
  prompt_key      VARCHAR(100) NOT NULL,
  -- 'vani-skill.gather' | 'vani-skill.extract' | 'icp-skill.build'
  version         INTEGER     NOT NULL DEFAULT 1,
  content         TEXT        NOT NULL,
  -- the actual prompt text
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  notes           TEXT,
  -- why this version was created
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_gt_prompts_active
  ON gt_prompts (prompt_key, tenant_id, is_active)
  WHERE is_active = true AND tenant_id IS NULL;
-- Ensures one active system prompt per key

CREATE INDEX idx_gt_prompts_key
  ON gt_prompts (prompt_key, tenant_id, version DESC);

-- ── KNOWLEDGE GRAPH (JSONB — AGE deferred to Phase 2) ─────────
CREATE TABLE IF NOT EXISTS gt_kg_nodes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  label           VARCHAR(50) NOT NULL,
  -- 'Product' | 'Feature' | 'ICP' | 'UseCase' |
  -- 'PainPoint' | 'Differentiator' | 'Team' | 'Competitor'
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  properties      JSONB       NOT NULL DEFAULT '{}',
  source_run_id   UUID        REFERENCES gt_agent_runs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, label, name)
);

CREATE TABLE IF NOT EXISTS gt_kg_edges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  from_node_id    UUID        NOT NULL REFERENCES gt_kg_nodes(id) ON DELETE CASCADE,
  to_node_id      UUID        NOT NULL REFERENCES gt_kg_nodes(id) ON DELETE CASCADE,
  relationship    VARCHAR(60) NOT NULL,
  -- 'HAS_FEATURE' | 'TARGETS' | 'FEELS' | 'ADDRESSES' |
  -- 'SOLVES' | 'DIFFERENTIATES_FROM' | 'BUILT_BY'
  properties      JSONB       NOT NULL DEFAULT '{}',
  source_run_id   UUID        REFERENCES gt_agent_runs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, from_node_id, relationship, to_node_id)
);

CREATE INDEX idx_gt_kg_nodes_tenant_label
  ON gt_kg_nodes (tenant_id, label);

CREATE INDEX idx_gt_kg_edges_from
  ON gt_kg_edges (tenant_id, from_node_id, relationship);

CREATE INDEX idx_gt_kg_edges_to
  ON gt_kg_edges (tenant_id, to_node_id);

-- ── SEED SYSTEM PROMPTS ────────────────────────────────────────
INSERT INTO gt_prompts (prompt_key, version, content, notes) VALUES
(
  'vani-skill.gather',
  1,
  'You are VaNi, an intelligent agent for Vikuna GTM platform. Your job is to understand a new tenant''s product, ICP, and GTM context through conversation.

Ask ONE focused question per turn. Be warm and specific, not clinical.
Cover in order: product description, core problem solved, ICP, differentiators, use cases, GTM stage, channels, pricing model, team size, vision.

After EVERY response, extract structured knowledge as JSON at the end:
<extract>{"label":"Product|Feature|ICP|UseCase|PainPoint|Differentiator|Team","name":"short unique name","description":"one clear sentence","properties":{}}</extract>

Rules:
- One <extract> tag per distinct insight. Multiple tags per turn allowed.
- Keep responses to 2-3 sentences + one question.
- After 8+ exchanges with sufficient coverage, include: <profile_ready/>
- Never ask two questions in one turn.',
  'Initial system prompt v1'
),
(
  'vani-skill.generate_slides',
  1,
  'You are VaNi, generating a product presentation from structured knowledge graph data.

Return ONLY a valid JSON array. No markdown fences. No explanation.

Each slide object:
{
  "id": 1,
  "type": "title|problem|solution|icp|differentiators|traction|cta",
  "title": "slide title",
  "subtitle": "one supporting line",
  "bullets": [{"icon":"emoji","head":"bold point","body":"one sentence"}],
  "narration": "3-4 sentences. Storytelling voice. Natural. Do not just read bullets."
}

Slide order: title → problem → solution → icp → differentiators → traction → cta
Be specific. Use names, numbers, real details from the knowledge graph. Generic is failure.',
  'Initial slide generation prompt v1'
),
(
  'vani-skill.answer_question',
  1,
  'You are VaNi, answering a live audience question during a presentation.
Answer using ONLY the product knowledge provided in context.
If the answer is not in the knowledge base, respond: "Great question — I will make sure the team follows up on that specifically."
Be conversational and confident. Maximum 3 sentences.',
  'Initial Q&A prompt v1'
)
ON CONFLICT DO NOTHING;
```

---

## 3. FOLDER STRUCTURE TO CREATE

```
backend/src/
├── agent-core/
│   ├── event.store.ts       ← write/read/poll gt_events
│   ├── agent.runner.ts      ← state machine, step logging, token tracking
│   ├── context.store.ts     ← read/write gt_tenant_context
│   ├── prompt.store.ts      ← load prompts from gt_prompts with fallback
│   ├── kg.store.ts          ← read/write gt_kg_nodes + gt_kg_edges
│   ├── llm.client.ts        ← VPS LLM client (OpenAI-compatible) + escalate() stub + Zod validation
│   └── worker.ts            ← polling loop, separate process entry point
│
└── skills/
    └── vani-skill/
        ├── SKILL.md
        ├── vani.agent.ts    ← Profile Agent logic
        ├── vani.routes.ts   ← REST endpoints for UI
        └── queries/
            ├── get-context.sql
            ├── get-graph.sql
            └── upsert-node.sql
```

---

## 4. FILE SPECIFICATIONS

### `agent-core/event.store.ts`

```typescript
import { Pool } from 'pg';
import { createTenantDb } from '../db'; // use existing pattern

export type EventType =
  | 'TENANT_REGISTERED'
  | 'PROFILE_COMPLETE'
  | 'ICP_APPROVED'
  | 'LEADS_IMPORTED'
  | 'SEQUENCE_READY'
  | 'SCHEDULED_PULSE'
  | 'AGENT_FAILED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'
  | 'WEBHOOK_RECEIVED'
  | 'FILE_INGESTED';

export type SourceType = 'human' | 'agent' | 'cron' | 'system' | 'webhook';

export interface GTEvent {
  id: string;
  tenant_id: string;
  event_type: EventType;
  source_type: SourceType;
  source_id?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'done' | 'failed';
  created_at: Date;
}

// Write a new event
export async function emitEvent(
  pool: Pool,
  tenantId: string,
  eventType: EventType,
  sourceType: SourceType,
  payload: Record<string, unknown>,
  sourceId?: string
): Promise<string> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<{ id: string }>(
    `INSERT INTO gt_events (tenant_id, event_type, source_type, source_id, payload)
     VALUES ($tenant_id, $event_type, $source_type, $source_id, $payload)
     RETURNING id`,
    {
      tenant_id: tenantId,
      event_type: eventType,
      source_type: sourceType,
      source_id: sourceId ?? null,
      payload: JSON.stringify(payload)
    }
  );
  return result.rows[0].id;
}

// Poll for pending events (worker calls this every N seconds)
export async function pollPendingEvents(
  pool: Pool,
  limit = 10
): Promise<GTEvent[]> {
  // Use pool directly — no tenant context for polling (cross-tenant)
  const result = await pool.query<GTEvent>(
    `UPDATE gt_events
     SET status = 'processing'
     WHERE id IN (
       SELECT id FROM gt_events
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [limit]
  );
  return result.rows;
}

// Mark event done or failed
export async function resolveEvent(
  pool: Pool,
  eventId: string,
  status: 'done' | 'failed',
  error?: string
): Promise<void> {
  await pool.query(
    `UPDATE gt_events
     SET status = $1, processed_at = NOW(), error = $2
     WHERE id = $3`,
    [status, error ?? null, eventId]
  );
}
```

---

### `agent-core/llm.client.ts`

```typescript
/**
 * LLM Client
 *
 * PRIMARY: VPS-hosted LLM — any model, any runtime (Ollama, vLLM, llama.cpp)
 *          Configured via LLM_PRIMARY_URL + LLM_PRIMARY_MODEL env vars.
 *          Uses OpenAI-compatible /v1/chat/completions endpoint.
 *          Zero external cost. All routine agent work goes here.
 *
 * ESCALATION: escalate() — stub, throws NOT_IMPLEMENTED.
 *             Will call external API (Claude / GPT) when a future agent
 *             needs complex reasoning beyond the VPS model's capability.
 *             SDK installed only when first agent actually uses escalation.
 *
 * Token tracking: vps and escalation tracked separately in daily_token_usage.
 */

import { z } from 'zod';
import { Pool } from 'pg';
import { createTenantDb } from '../db';

// npm install zod   (only new dependency needed)

// ── VPS LLM CONFIG ──────────────────────────────────────────────────────────
// LLM_PRIMARY_URL  — base URL of OpenAI-compatible server on VPS
//                    e.g. http://localhost:11434 (Ollama)
//                         http://localhost:8000  (vLLM)
//                         http://qwen:11434      (Docker service name)
// LLM_PRIMARY_MODEL — model name as the server expects it
//                    e.g. qwen2.5, lfm2, llama3.2, mistral
const VPS_URL   = process.env.LLM_PRIMARY_URL   ?? 'http://localhost:11434';
const VPS_MODEL = process.env.LLM_PRIMARY_MODEL ?? 'qwen2.5';

export interface LLMCallOptions {
  tenantId: string;
  pool: Pool;
  runId: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}

export interface LLMResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  source: 'vps' | 'escalation';
}

// ── TOKEN BUDGET ─────────────────────────────────────────────────────────────
async function checkTokenBudget(
  pool: Pool,
  tenantId: string,
  estimatedTokens: number
): Promise<void> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<{
    daily_token_limit: number;
    daily_token_usage: Record<string, { vps: number; escalation: number }>;
  }>(
    `SELECT daily_token_limit, daily_token_usage
     FROM gt_tenant_context WHERE tenant_id = $tenant_id`,
    { tenant_id: tenantId }
  );

  if (!result.rows[0]) return; // no context yet — allow

  const today = new Date().toISOString().split('T')[0];
  const usage  = result.rows[0].daily_token_usage?.[today] ?? { vps: 0, escalation: 0 };
  const total  = (usage.vps ?? 0) + (usage.escalation ?? 0);
  const limit  = result.rows[0].daily_token_limit ?? 100000;

  if (total + estimatedTokens > limit) {
    throw new Error(
      `TOKEN_BUDGET_EXCEEDED: Tenant ${tenantId} has used ${total} tokens today (limit: ${limit})`
    );
  }
}

// ── TOKEN USAGE RECORDER ─────────────────────────────────────────────────────
async function recordTokenUsage(
  pool: Pool,
  tenantId: string,
  tokens: number,
  source: 'vps' | 'escalation'
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const db    = createTenantDb(pool, tenantId);

  await db.query(
    `UPDATE gt_tenant_context
     SET daily_token_usage = jsonb_set(
       daily_token_usage,
       ARRAY[$date_key],
       COALESCE(daily_token_usage->$date_key,
         '{"vps":0,"escalation":0}'::jsonb
       ) || jsonb_build_object(
         $source_key,
         COALESCE((daily_token_usage->$date_key->$source_key)::int, 0) + $tokens
       )
     ),
     updated_at = NOW()
     WHERE tenant_id = $tenant_id`,
    {
      tenant_id: tenantId,
      date_key:  today,
      source_key: source,
      tokens
    }
  );
}

// ── PRIMARY: VPS LLM CALL ────────────────────────────────────────────────────
// Uses OpenAI-compatible /v1/chat/completions.
// Works with Ollama, vLLM, llama.cpp server, LMStudio, anything compatible.
export async function callLLM(options: LLMCallOptions): Promise<LLMResult> {
  const { tenantId, pool, system, messages, maxTokens = 1000 } = options;

  await checkTokenBudget(pool, tenantId, maxTokens);

  const body = {
    model: VPS_MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      ...messages
    ],
    stream: false,
    temperature: 0.2
  };

  let response: Response;
  try {
    response = await fetch(`${VPS_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000) // 60s timeout
    });
  } catch (err) {
    throw new Error(`LLM_VPS_UNREACHABLE: Cannot reach ${VPS_URL} — ${String(err)}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`LLM_VPS_ERROR: ${response.status} ${response.statusText} — ${detail}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const text         = data.choices?.[0]?.message?.content ?? '';
  const inputTokens  = data.usage?.prompt_tokens     ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  await recordTokenUsage(pool, tenantId, inputTokens + outputTokens, 'vps');

  return { text, inputTokens, outputTokens, source: 'vps' };
}

// ── ESCALATION STUB ──────────────────────────────────────────────────────────
// Placeholder for future external LLM integration.
// No SDK installed until a specific agent actually requires escalation.
// When needed: install SDK, implement, remove the throw.
//
// Follows VaNi Framework pattern — SkillContext.escalate() calls this.
export async function escalate(
  _prompt: string,
  _context?: string
): Promise<string> {
  // TODO NEXT STAGE: implement escalation to external LLM (Claude / GPT)
  // Install SDK only when first agent needs complex reasoning beyond VPS model.
  throw new Error(
    'ESCALATION_NOT_IMPLEMENTED: External LLM escalation not yet configured. ' +
    'VPS model handles all current agent reasoning.'
  );
}

// ── VALIDATED CALL ───────────────────────────────────────────────────────────
// Parse JSON output with Zod schema. Retries ONCE with correction if invalid.
export async function callLLMValidated<T>(
  options: LLMCallOptions,
  schema: z.ZodSchema<T>,
  jsonPath?: string // optional: extract JSON from a tagged section e.g. <slides>[...]</slides>
): Promise<T> {
  const result = await callLLM(options);

  const parseAttempt = (text: string): T | null => {
    try {
      let raw = text.replace(/```json|```/g, '').trim();
      if (jsonPath) {
        const match = raw.match(new RegExp(`<${jsonPath}>([\\s\\S]*?)<\\/${jsonPath}>`));
        if (match) raw = match[1].trim();
      }
      return schema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  };

  const first = parseAttempt(result.text);
  if (first !== null) return first;

  // Retry once with correction prompt
  const correctionMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...options.messages,
    { role: 'assistant', content: result.text },
    {
      role: 'user',
      content: 'Your response was not valid JSON. Respond with ONLY valid JSON. No explanation, no markdown fences.'
    }
  ];

  const retry  = await callLLM({ ...options, messages: correctionMessages });
  const second = parseAttempt(retry.text);

  if (second !== null) return second;

  throw new Error(
    `LLM_VALIDATION_FAILED: Could not parse valid JSON after retry. ` +
    `Last response: ${retry.text.slice(0, 200)}`
  );
}
```

---

### `agent-core/prompt.store.ts`

```typescript
import { Pool } from 'pg';

// Load active prompt by key
// Falls back to: tenant override → system prompt → throws
export async function loadPrompt(
  pool: Pool,
  promptKey: string,
  tenantId?: string
): Promise<string> {
  // Try tenant override first
  if (tenantId) {
    const result = await pool.query<{ content: string }>(
      `SELECT content FROM gt_prompts
       WHERE prompt_key = $1 AND tenant_id = $2 AND is_active = true
       LIMIT 1`,
      [promptKey, tenantId]
    );
    if (result.rows[0]) return result.rows[0].content;
  }

  // Fall back to system prompt
  const result = await pool.query<{ content: string }>(
    `SELECT content FROM gt_prompts
     WHERE prompt_key = $1 AND tenant_id IS NULL AND is_active = true
     LIMIT 1`,
    [promptKey]
  );

  if (!result.rows[0]) {
    throw new Error(`PROMPT_NOT_FOUND: No active prompt for key '${promptKey}'`);
  }

  return result.rows[0].content;
}

// Save a new prompt version (deactivates previous)
export async function savePromptVersion(
  pool: Pool,
  promptKey: string,
  content: string,
  notes: string,
  createdBy?: string,
  tenantId?: string
): Promise<void> {
  await pool.query('BEGIN');
  try {
    // Deactivate current
    await pool.query(
      `UPDATE gt_prompts SET is_active = false
       WHERE prompt_key = $1 AND tenant_id IS NOT DISTINCT FROM $2 AND is_active = true`,
      [promptKey, tenantId ?? null]
    );

    // Get next version number
    const vResult = await pool.query<{ max: number }>(
      `SELECT COALESCE(MAX(version), 0) as max FROM gt_prompts
       WHERE prompt_key = $1 AND tenant_id IS NOT DISTINCT FROM $2`,
      [promptKey, tenantId ?? null]
    );

    await pool.query(
      `INSERT INTO gt_prompts (prompt_key, tenant_id, version, content, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [promptKey, tenantId ?? null, (vResult.rows[0].max ?? 0) + 1, content, notes, createdBy ?? null]
    );

    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}
```

---

### `agent-core/agent.runner.ts`

```typescript
import { Pool } from 'pg';

export type AgentStatus = 'queued' | 'running' | 'awaiting' | 'completed' | 'failed';

export interface AgentStep {
  ts: string;
  step_name: string;
  action: string;
  input_summary?: string;
  output_summary?: string;
  duration_ms?: number;
  status: 'ok' | 'error' | 'skipped';
}

// Create a new agent run
export async function createRun(
  pool: Pool,
  tenantId: string,
  agentName: string,
  eventId?: string
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO gt_agent_runs (tenant_id, agent_name, event_id, status)
     VALUES ($1, $2, $3, 'queued') RETURNING id`,
    [tenantId, agentName, eventId ?? null]
  );
  return result.rows[0].id;
}

// Transition run status
export async function setStatus(
  pool: Pool,
  runId: string,
  status: AgentStatus,
  extras: Record<string, unknown> = {}
): Promise<void> {
  const setClauses: string[] = ['status = $2'];
  const values: unknown[] = [runId, status];
  let i = 3;

  if (status === 'running') {
    setClauses.push(`started_at = NOW()`);
  }
  if (status === 'completed' || status === 'failed') {
    setClauses.push(`completed_at = NOW()`);
    setClauses.push(`duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000`);
  }
  if (extras.awaiting_input !== undefined) {
    setClauses.push(`awaiting_input = $${i++}`);
    values.push(JSON.stringify(extras.awaiting_input));
  }
  if (extras.output !== undefined) {
    setClauses.push(`output = $${i++}`);
    values.push(JSON.stringify(extras.output));
  }
  if (extras.error_trace !== undefined) {
    setClauses.push(`error_trace = $${i++}`);
    values.push(extras.error_trace as string);
  }
  if (extras.token_usage !== undefined) {
    setClauses.push(`token_usage = $${i++}`);
    values.push(JSON.stringify(extras.token_usage));
  }
  if (extras.last_checkpoint !== undefined) {
    setClauses.push(`last_checkpoint = $${i++}`);
    values.push(extras.last_checkpoint as string);
  }

  await pool.query(
    `UPDATE gt_agent_runs SET ${setClauses.join(', ')} WHERE id = $1`,
    values
  );
}

// Append a step to the run log
export async function appendStep(
  pool: Pool,
  runId: string,
  step: Omit<AgentStep, 'ts'>
): Promise<void> {
  const fullStep: AgentStep = { ...step, ts: new Date().toISOString() };
  await pool.query(
    `UPDATE gt_agent_runs
     SET steps = steps || $1::jsonb
     WHERE id = $2`,
    [JSON.stringify([fullStep]), runId]
  );
}

// Get run by ID
export async function getRun(pool: Pool, runId: string) {
  const result = await pool.query(
    `SELECT * FROM gt_agent_runs WHERE id = $1`,
    [runId]
  );
  return result.rows[0] ?? null;
}

// Get all runs for a tenant + agent
export async function getRuns(
  pool: Pool,
  tenantId: string,
  agentName?: string,
  limit = 20
) {
  const result = await pool.query(
    `SELECT id, agent_name, status, steps, awaiting_input,
            token_usage, duration_ms, started_at, completed_at, created_at
     FROM gt_agent_runs
     WHERE tenant_id = $1
       AND ($2::text IS NULL OR agent_name = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [tenantId, agentName ?? null, limit]
  );
  return result.rows;
}
```

---

### `agent-core/worker.ts`

```typescript
/**
 * Agent Worker — separate process, polls gt_events and dispatches agents.
 *
 * Run: node dist/agent-core/worker.js
 * Add to docker-compose as a separate service (same image as backend).
 *
 * EventQueue is an interface — PostgresEventQueue implements it now.
 * BullMQ implementation drops in later with zero changes to agent logic.
 */

import { Pool } from 'pg';
import { GTEvent, emitEvent } from './event.store';
import { createRun, setStatus, appendStep } from './agent.runner';
import { VaniAgent } from '../skills/vani-skill/vani.agent';

// ── EVENT QUEUE INTERFACE ────────────────────────────────────────────────────
// All worker logic talks to this interface only.
// Swap implementations without touching agent code.
export interface EventQueue {
  poll(limit: number): Promise<GTEvent[]>;
  resolve(eventId: string, status: 'done' | 'failed', error?: string): Promise<void>;
}

// ── POSTGRES IMPLEMENTATION (current) ───────────────────────────────────────
export class PostgresEventQueue implements EventQueue {
  constructor(private readonly pool: Pool) {}

  async poll(limit: number): Promise<GTEvent[]> {
    const result = await this.pool.query<GTEvent>(
      `UPDATE gt_events
       SET status = 'processing'
       WHERE id IN (
         SELECT id FROM gt_events
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit]
    );
    return result.rows;
  }

  async resolve(eventId: string, status: 'done' | 'failed', error?: string): Promise<void> {
    await this.pool.query(
      `UPDATE gt_events
       SET status = $1, processed_at = NOW(), error = $2
       WHERE id = $3`,
      [status, error ?? null, eventId]
    );
  }
}

// TODO NEXT STAGE: BullMQEventQueue implements EventQueue
// When ready, swap: const queue = new BullMQEventQueue(redisConnection);
// Zero changes to processEvent or AGENT_REGISTRY.

// ── AGENT REGISTRY ───────────────────────────────────────────────────────────
// Maps event_type → agent handler function.
// Add new agents here as they are built. Nothing else changes.
type AgentHandler = (
  pool: Pool,
  tenantId: string,
  payload: Record<string, unknown>,
  runId: string
) => Promise<void>;

const AGENT_REGISTRY: Record<string, AgentHandler> = {
  TENANT_REGISTERED: (pool, tenantId, payload, runId) =>
    VaniAgent.handleTenantRegistered(pool, tenantId, payload, runId),
  HUMAN_APPROVED: (pool, tenantId, payload, runId) =>
    VaniAgent.handleHumanApproved(pool, tenantId, payload, runId),
  // Future agents — add here, nothing else changes:
  // PROFILE_COMPLETE: (pool, tenantId, payload, runId) => ICPAgent.run(...)
  // ICP_APPROVED:     (pool, tenantId, payload, runId) => LeadAgent.run(...)
  // LEADS_IMPORTED:   (pool, tenantId, payload, runId) => ScoringAgent.run(...)
};

// ── PROCESS ONE EVENT ────────────────────────────────────────────────────────
async function processEvent(
  pool: Pool,
  queue: EventQueue,
  event: GTEvent
): Promise<void> {
  const handler = AGENT_REGISTRY[event.event_type];

  if (!handler) {
    // No agent registered for this event type yet — skip cleanly
    await queue.resolve(event.id, 'done');
    return;
  }

  const runId = await createRun(pool, event.tenant_id, event.event_type, event.id);

  try {
    await setStatus(pool, runId, 'running');
    await appendStep(pool, runId, {
      step_name: 'init',
      action: `Processing event: ${event.event_type}`,
      input_summary: JSON.stringify(event.payload).slice(0, 200),
      status: 'ok'
    });

    await handler(pool, event.tenant_id, event.payload as Record<string, unknown>, runId);
    await queue.resolve(event.id, 'done');

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[Worker] Agent failed — event ${event.id}:`, error.message);

    await setStatus(pool, runId, 'failed', {
      error_trace: error.stack ?? error.message,
      last_checkpoint: 'see steps array'
    });
    await queue.resolve(event.id, 'failed', error.message);

    // Emit AGENT_FAILED so alert-skill can notify the tenant
    try {
      await emitEvent(pool, event.tenant_id, 'AGENT_FAILED', 'agent', {
        failed_event_type: event.event_type,
        run_id: runId,
        error: error.message
      }, runId);
    } catch (alertErr) {
      console.error('[Worker] Failed to emit AGENT_FAILED event:', alertErr);
    }
  }
}

// ── POLL LOOP ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_MS ?? '3000', 10);
const POLL_BATCH_SIZE  = parseInt(process.env.WORKER_BATCH_SIZE ?? '5', 10);

async function startWorker(pool: Pool, queue: EventQueue): Promise<void> {
  async function poll(): Promise<void> {
    try {
      const events = await queue.poll(POLL_BATCH_SIZE);
      for (const event of events) {
        // Process concurrently — one failure does not block others
        processEvent(pool, queue, event).catch(err =>
          console.error(`[Worker] Unhandled error for event ${event.id}:`, err)
        );
      }
    } catch (err) {
      console.error('[Worker] Poll error:', err);
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  }

  console.log(`[Worker] Starting — polling every ${POLL_INTERVAL_MS}ms, batch size ${POLL_BATCH_SIZE}`);
  poll();
}

// ── ENTRY POINT ──────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DB_PRIMARY,
  ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5 // smaller pool than main server
});

const queue = new PostgresEventQueue(pool);
// TODO NEXT STAGE: const queue = new BullMQEventQueue(redisConnection);

startWorker(pool, queue);

process.on('SIGTERM', async () => {
  console.log('[Worker] Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
```

---

### `skills/vani-skill/vani.agent.ts`

```typescript
/**
 * VaNi Profile Agent
 * Triggered by: TENANT_REGISTERED, HUMAN_APPROVED
 * Reads from: gt_prompts, gt_tenant_context
 * Writes to: gt_tenant_context, gt_kg_nodes, gt_kg_edges
 * Emits: PROFILE_COMPLETE (when human approves profile)
 */

import { Pool } from 'pg';
import { createTenantDb } from '../../db';
import { appendStep, setStatus } from '../../agent-core/agent.runner';
import { loadPrompt } from '../../agent-core/prompt.store';
import { callLLM } from '../../agent-core/llm.client';
import { emitEvent } from '../../agent-core/event.store';

interface ExtractedNode {
  label: string;
  name: string;
  description: string;
  properties: Record<string, unknown>;
}

export class VaniAgent {

  // ── TRIGGER: New tenant registered ──────────────────────────
  static async handleTenantRegistered(
    pool: Pool,
    tenantId: string,
    payload: Record<string, unknown>,
    runId: string
  ): Promise<void> {
    const db = createTenantDb(pool, tenantId);

    // Ensure tenant context row exists
    await db.query(
      `INSERT INTO gt_tenant_context (tenant_id)
       VALUES ($tenant_id)
       ON CONFLICT (tenant_id) DO NOTHING`,
      { tenant_id: tenantId }
    );

    await appendStep(pool, runId, {
      step_name: 'init_context',
      action: 'Created tenant context row',
      status: 'ok'
    });

    // Load opening prompt
    const systemPrompt = await loadPrompt(pool, 'vani-skill.gather', tenantId);

    // Generate opening question
    const result = await callLLM({
      tenantId, pool, runId,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'START_CONVERSATION' }],
      maxTokens: 400
    });

    const openingMessage = result.text
      .replace(/<extract>[\s\S]*?<\/extract>/g, '')
      .replace(/<profile_ready\/>/g, '')
      .trim();

    // Store opening message in context so UI can display it
    await db.query(
      `UPDATE gt_tenant_context
       SET knowledge = knowledge || $knowledge,
           updated_by = 'vani-skill',
           updated_at = NOW()
       WHERE tenant_id = $tenant_id`,
      {
        tenant_id: tenantId,
        knowledge: JSON.stringify({
          'vani-skill': {
            status: 'gathering',
            conversation: [{ role: 'assistant', content: openingMessage }],
            run_id: runId
          }
        })
      }
    );

    // Agent is now AWAITING — waiting for tenant to respond in UI
    await setStatus(pool, runId, 'awaiting', {
      awaiting_input: {
        type: 'input',
        prompt: openingMessage,
        context: 'profile_gathering'
      }
    });

    await appendStep(pool, runId, {
      step_name: 'await_tenant_input',
      action: 'Opening question sent to tenant',
      output_summary: openingMessage.slice(0, 100),
      status: 'ok'
    });
  }

  // ── CONVERSATION TURN ────────────────────────────────────────
  // Called by REST route when tenant sends a message
  static async conversationTurn(
    pool: Pool,
    tenantId: string,
    runId: string,
    userMessage: string
  ): Promise<{
    reply: string;
    extractedNodes: ExtractedNode[];
    isReady: boolean;
  }> {
    const db = createTenantDb(pool, tenantId);

    // Load conversation history from context
    const ctxResult = await db.query<{
      knowledge: { 'vani-skill': { conversation: Array<{ role: string; content: string }> } }
    }>(
      `SELECT knowledge FROM gt_tenant_context WHERE tenant_id = $tenant_id`,
      { tenant_id: tenantId }
    );

    const vaniKnowledge = ctxResult.rows[0]?.knowledge?.['vani-skill'] ?? { conversation: [] };
    const history = vaniKnowledge.conversation ?? [];

    // Load system prompt
    const systemPrompt = await loadPrompt(pool, 'vani-skill.gather', tenantId);

    // Call LLM
    const messages = [
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: userMessage }
    ].slice(-20); // keep last 20 turns

    const result = await callLLM({
      tenantId, pool, runId,
      system: systemPrompt,
      messages,
      maxTokens: 600
    });

    const raw = result.text;

    // Extract nodes
    const extractMatches = [...raw.matchAll(/<extract>([\s\S]*?)<\/extract>/g)];
    const extractedNodes: ExtractedNode[] = extractMatches
      .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
      .filter(Boolean) as ExtractedNode[];

    const isReady = raw.includes('<profile_ready/>');
    const reply = raw
      .replace(/<extract>[\s\S]*?<\/extract>/g, '')
      .replace(/<profile_ready\/>/g, '')
      .trim();

    // Save extracted nodes to knowledge graph
    for (const node of extractedNodes) {
      try {
        await db.query(
          `INSERT INTO gt_kg_nodes (tenant_id, label, name, description, properties, source_run_id)
           VALUES ($tenant_id, $label, $name, $description, $properties, $source_run_id)
           ON CONFLICT (tenant_id, label, name)
           DO UPDATE SET description = EXCLUDED.description,
                         properties = gt_kg_nodes.properties || EXCLUDED.properties,
                         updated_at = NOW()`,
          {
            tenant_id: tenantId,
            label: node.label,
            name: node.name,
            description: node.description ?? '',
            properties: JSON.stringify(node.properties ?? {}),
            source_run_id: runId
          }
        );
      } catch (err) {
        console.warn('[VaNi] Node upsert failed:', node.name, err);
      }
    }

    // Append to conversation history
    const updatedConversation = [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: reply }
    ].slice(-30);

    const nodeCount = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM gt_kg_nodes WHERE tenant_id = $tenant_id`,
      { tenant_id: tenantId }
    );

    await db.query(
      `UPDATE gt_tenant_context
       SET knowledge = knowledge || $knowledge,
           updated_by = 'vani-skill',
           updated_at = NOW(),
           version = version + 1
       WHERE tenant_id = $tenant_id`,
      {
        tenant_id: tenantId,
        knowledge: JSON.stringify({
          'vani-skill': {
            ...vaniKnowledge,
            status: isReady ? 'ready_for_review' : 'gathering',
            conversation: updatedConversation,
            node_count: parseInt(nodeCount.rows[0].count, 10)
          }
        })
      }
    );

    // Update run step
    await appendStep(pool, runId, {
      step_name: 'conversation_turn',
      action: `Turn completed. Extracted ${extractedNodes.length} nodes.`,
      input_summary: userMessage.slice(0, 100),
      output_summary: reply.slice(0, 100),
      status: 'ok'
    });

    return { reply, extractedNodes, isReady };
  }

  // ── TRIGGER: Human approved profile ─────────────────────────
  static async handleHumanApproved(
    pool: Pool,
    tenantId: string,
    payload: Record<string, unknown>,
    runId: string
  ): Promise<void> {
    const db = createTenantDb(pool, tenantId);

    await appendStep(pool, runId, {
      step_name: 'profile_approved',
      action: 'Human approved profile — building summary',
      status: 'ok'
    });

    // Get all graph nodes for this tenant
    const nodes = await db.query<{
      label: string; name: string; description: string;
    }>(
      `SELECT label, name, description FROM gt_kg_nodes
       WHERE tenant_id = $tenant_id ORDER BY label, name`,
      { tenant_id: tenantId }
    );

    // Build profile summary
    const byLabel: Record<string, string[]> = {};
    for (const node of nodes.rows) {
      if (!byLabel[node.label]) byLabel[node.label] = [];
      byLabel[node.label].push(`${node.name}: ${node.description}`);
    }

    const profileSummary = Object.entries(byLabel)
      .map(([label, items]) => `${label}: ${items.join(' | ')}`)
      .join('\n');

    // Update context with approved profile
    await db.query(
      `UPDATE gt_tenant_context
       SET profile = profile || $profile,
           knowledge = knowledge || $knowledge,
           updated_by = 'vani-skill',
           updated_at = NOW()
       WHERE tenant_id = $tenant_id`,
      {
        tenant_id: tenantId,
        profile: JSON.stringify({ profile_summary: profileSummary, profile_approved: true }),
        knowledge: JSON.stringify({
          'vani-skill': { status: 'approved', approved_at: new Date().toISOString() }
        })
      }
    );

    await setStatus(pool, runId, 'completed', {
      output: { node_count: nodes.rows.length, profile_summary: profileSummary }
    });

    // Emit PROFILE_COMPLETE — wakes up ICP Agent and Storyteller Agent
    await emitEvent(pool, tenantId, 'PROFILE_COMPLETE', 'agent', {
      run_id: runId,
      node_count: nodes.rows.length
    }, runId);

    await appendStep(pool, runId, {
      step_name: 'profile_complete',
      action: `Profile complete. Emitted PROFILE_COMPLETE. ${nodes.rows.length} nodes in graph.`,
      status: 'ok'
    });
  }
}
```

---

### `skills/vani-skill/vani.routes.ts`

```typescript
/**
 * VaNi REST routes — mounted at /api/v1/vani
 * Follows exact pattern of backend/src/master-data/master-data.routes.ts
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { createTenantDb } from '../../db';
import { emitEvent } from '../../agent-core/event.store';
import { getRuns, getRun } from '../../agent-core/agent.runner';
import { VaniAgent } from './vani.agent';

export function createVaniRouter(pool: Pool): Router {
  const router = Router();

  // Helper — copy exact pattern from auth.routes.ts
  function extractJwt(req: Request): { user_id: string; tenant_id: string } | null {
    // Claude Code: copy the exact extractJwt implementation from auth.routes.ts
    // Do NOT create a new implementation
    throw new Error('Replace with actual extractJwt from auth.routes.ts');
  }

  // ── GET /api/v1/vani/status ──────────────────────────────────
  // Get current VaNi state for the tenant (for agentic UI polling)
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });

      const db = createTenantDb(pool, jwt.tenant_id);

      const [context, runs] = await Promise.all([
        db.query(
          `SELECT profile, knowledge, daily_token_usage, daily_token_limit, version, updated_at
           FROM gt_tenant_context WHERE tenant_id = $tenant_id`,
          { tenant_id: jwt.tenant_id }
        ),
        getRuns(pool, jwt.tenant_id, 'TENANT_REGISTERED', 1)
      ]);

      return res.json({
        context: context.rows[0] ?? null,
        latest_run: runs[0] ?? null
      });
    } catch (err) {
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: String(err) } });
    }
  });

  // ── GET /api/v1/vani/runs ────────────────────────────────────
  // Get all agent runs for agentic UI
  router.get('/runs', async (req: Request, res: Response) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });

      const runs = await getRuns(pool, jwt.tenant_id);
      return res.json({ runs });
    } catch (err) {
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: String(err) } });
    }
  });

  // ── POST /api/v1/vani/gather ─────────────────────────────────
  // Tenant sends a message during profile gathering
  router.post('/gather', async (req: Request, res: Response) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });

      const { message, run_id } = req.body as { message: string; run_id: string };
      if (!message || !run_id) {
        return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'message and run_id required' } });
      }

      const result = await VaniAgent.conversationTurn(pool, jwt.tenant_id, run_id, message);
      return res.json(result);

    } catch (err) {
      const msg = String(err);
      if (msg.includes('TOKEN_BUDGET_EXCEEDED')) {
        return res.status(429).json({ error: { code: 'TOKEN_BUDGET_EXCEEDED', message: msg } });
      }
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  });

  // ── POST /api/v1/vani/approve ────────────────────────────────
  // Human approves the gathered profile
  router.post('/approve', async (req: Request, res: Response) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });

      await emitEvent(pool, jwt.tenant_id, 'HUMAN_APPROVED', 'human', {
        context: 'profile_approval',
        approved_by: jwt.user_id
      }, jwt.user_id);

      return res.json({ success: true, message: 'Profile approved — processing' });
    } catch (err) {
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: String(err) } });
    }
  });

  // ── GET /api/v1/vani/graph ───────────────────────────────────
  // Get knowledge graph for tenant
  router.get('/graph', async (req: Request, res: Response) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });

      const db = createTenantDb(pool, jwt.tenant_id);

      const [nodes, edges] = await Promise.all([
        db.query(
          `SELECT id, label, name, description, properties, created_at
           FROM gt_kg_nodes WHERE tenant_id = $tenant_id ORDER BY label, name`,
          { tenant_id: jwt.tenant_id }
        ),
        db.query(
          `SELECT e.id, e.relationship, e.properties,
                  fn.label as from_label, fn.name as from_name,
                  tn.label as to_label, tn.name as to_name
           FROM gt_kg_edges e
           JOIN gt_kg_nodes fn ON fn.id = e.from_node_id
           JOIN gt_kg_nodes tn ON tn.id = e.to_node_id
           WHERE e.tenant_id = $tenant_id`,
          { tenant_id: jwt.tenant_id }
        )
      ]);

      return res.json({ nodes: nodes.rows, edges: edges.rows });
    } catch (err) {
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: String(err) } });
    }
  });

  return router;
}
```

---

## 5. WIRE INTO SERVER.TS

Find `server.ts`. After the last existing `app.use(...)` route registration, add:

```typescript
// Agent infrastructure
import { createVaniRouter } from './skills/vani-skill/vani.routes';
app.use('/api/v1/vani', createVaniRouter(pool));
```

---

## 6. ENVIRONMENT VARIABLES

Add to `.env` and `.env.example`:

```env
# VPS LLM — primary model (OpenAI-compatible endpoint)
# Point to whatever is running on the VPS: Ollama, vLLM, llama.cpp, etc.
LLM_PRIMARY_URL=http://localhost:11434
LLM_PRIMARY_MODEL=qwen2.5

# Worker
WORKER_POLL_MS=3000
WORKER_BATCH_SIZE=5
```

> **Note:** No `ANTHROPIC_API_KEY` needed at this stage.
> Escalation to external LLM is stubbed — added when a future agent requires it.

---

## 7. PACKAGE DEPENDENCIES

```bash
npm install zod
```

Only `zod` is new. Check `package.json` before running — it may already be installed.

> **Not needed:** `@anthropic-ai/sdk` — escalation is stubbed, no external SDK required.

---

## 8. WORKER IN DOCKER

Same image as backend, different command. Add to `docker-compose` in `deploy/`:

```yaml
backend-worker:
  image: vikuna/prokey-backend   # same image as backend
  command: node dist/agent-core/worker.js
  environment:
    - DB_PRIMARY=${DB_PRIMARY}
    - DB_PRIMARY_SSL=${DB_PRIMARY_SSL}
    - LLM_PRIMARY_URL=${LLM_PRIMARY_URL}
    - LLM_PRIMARY_MODEL=${LLM_PRIMARY_MODEL}
    - WORKER_POLL_MS=3000
    - WORKER_BATCH_SIZE=5
  depends_on:
    - postgres
  restart: unless-stopped
```

---

## 9. NEXT STAGE (DO NOT BUILD NOW — marked as TODO comments in code)

```typescript
// TODO NEXT STAGE: escalate() — implement external LLM call when complex reasoning needed
//                  Install SDK (Anthropic / OpenAI) only when first agent uses it
// TODO NEXT STAGE: BullMQEventQueue — swap PostgresEventQueue, zero agent code changes
// TODO NEXT STAGE: Evals pipeline — quality scoring per agent output
// TODO NEXT STAGE: OpenTelemetry — distributed tracing across worker + API
// TODO NEXT STAGE: Prompt A/B testing — variant testing on gt_prompts
// TODO NEXT STAGE: Rate limiting dashboard — per-tenant token usage UI
// TODO NEXT STAGE: Apache AGE — migrate gt_kg_nodes/edges to graph DB
```

---

## 10. DEFINITION OF DONE

Claude Code must verify each item before marking complete:

```
[ ] Migration runs without error on existing DB
[ ] gt_events, gt_tenant_context, gt_kg_nodes, gt_kg_edges tables created
[ ] gt_prompts seeded with 3 system prompts
[ ] worker.ts compiles and starts — logs "Starting — polling every 3000ms"
[ ] POST to /api/v1/auth/register → TENANT_REGISTERED event appears in gt_events
[ ] Worker picks up event → gt_agent_runs row created with status 'running'
[ ] GET /api/v1/vani/status returns context + run (with valid JWT)
[ ] POST /api/v1/vani/gather returns { reply, extractedNodes, isReady }
[ ] Node appears in gt_kg_nodes after gather turn
[ ] POST /api/v1/vani/approve → HUMAN_APPROVED event → PROFILE_COMPLETE emitted
[ ] Token usage recorded in gt_tenant_context.daily_token_usage
[ ] Agent FAILED state — error_trace populated, AGENT_FAILED event emitted
[ ] All routes return 401 without valid JWT
[ ] All routes return structured { error: { code, message } } on failure
```
