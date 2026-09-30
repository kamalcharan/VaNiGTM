/**
 * Text embedding — 768-dim vectors for the semantic layer.
 *
 * One primary path: an Ollama-compatible endpoint at EMBED_URL. No silent fallback if the endpoint is unreachable or the
 * model is missing — the caller sees the real cause and stops, per
 * VaNiGTM rule 12.
 *
 * ── Model choice ─────────────────────────────────────────────────────────
 * EMBED_MODEL in .env (e.g. `nomic-embed-text`, 768-dim, on Ollama).
 * Dimension MUST match the vector(768) column shape
 * in migration 246 — a different-dim vector fails the pgvector CHECK at
 * insert time.
 *
 * ── What this helper is NOT ──────────────────────────────────────────────
 * - Not a batcher. Callers embed one text at a time. If we later need
 *   bulk backfill for existing rows, that gets its own worker with a
 *   named backpressure policy (batch size + rate limit) — not squirrelled
 *   into this helper.
 * - Not a cache. Every call goes to the model. Callers that need dedup
 *   (Extractor seeing the same skill name twice in one JD) do it themselves.
 * - Not wired to any writer yet. It exists so the Extractor's call site
 *   (Phase 2) is a one-line import.
 */

/**
 * From .env, read at call time, no defaults (Charan, 2026-09-30: "no
 * hardcoding … everything comes from .env"). This used to fall back to
 * LLM_PRIMARY_URL → localhost:11434 and `nomic-embed-text`: the chat server
 * and the embedding server are not necessarily the same box, and which
 * embedding provider to use is still an open decision (POA D6).
 *
 * Unlike the chat settings this does NOT stop the process at start: nothing
 * but free-text intent routing uses it today, and that path already answers
 * "free-text questions are unavailable" (503) on any EmbedError. Missing
 * settings arrive there as EMBED_NOT_CONFIGURED, naming them.
 */
function embedConfig(): { url: string; model: string; key: string; timeoutMs: number; dim: number } {
  const missing = ['EMBED_URL', 'EMBED_MODEL', 'EMBED_TIMEOUT_MS', 'EMBED_DIM']
    .filter((k) => !(process.env[k] ?? '').trim());
  const timeoutMs = Number(process.env.EMBED_TIMEOUT_MS);
  const dim = Number(process.env.EMBED_DIM);
  if (!missing.length && (!Number.isInteger(timeoutMs) || timeoutMs < 1000)) {
    missing.push(`EMBED_TIMEOUT_MS=${process.env.EMBED_TIMEOUT_MS} (whole ms ≥ 1000)`);
  }
  if (!missing.length && (!Number.isInteger(dim) || dim < 1)) {
    missing.push(`EMBED_DIM=${process.env.EMBED_DIM} (a whole number)`);
  }
  if (missing.length) {
    throw new EmbedError('EMBED_NOT_CONFIGURED',
      `Embeddings are not configured: ${missing.join(', ')}. Set them in .env (backend/.env.example).`);
  }
  return {
    url: process.env.EMBED_URL!.trim().replace(/\/+$/, ''),
    model: process.env.EMBED_MODEL!.trim(),
    key: (process.env.EMBED_KEY ?? '').trim(),
    timeoutMs,
    dim,
  };
}

/** Dimension the vector columns expect — EMBED_DIM in .env, which must match
 *  the vector(768) columns of migration 246. Checked on every result so a
 *  wrong-model deployment fails loudly here instead of at a pgvector insert. */

export class EmbedError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EmbedError';
  }
}

/**
 * Embed one text. Returns a Float32-compatible number[EMBED_DIM].
 *
 * Throws EmbedError on any of:
 *   - endpoint unreachable / non-200
 *   - response shape unexpected
 *   - dimension mismatch (wrong model configured)
 *
 * Callers pass the result straight into pgvector: pg's node driver
 * accepts a JS number[] for a vector column when serialised as the
 * string form '[0.1, 0.2, ...]'. helpers below do the string wrap.
 */
export async function embedText(text: string): Promise<number[]> {
  if (!text || !text.trim()) {
    throw new EmbedError('EMPTY_INPUT', 'embedText called with empty text');
  }
  const cfg = embedConfig();
  const url = `${cfg.url}/api/embeddings`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
      },
      body: JSON.stringify({ model: cfg.model, prompt: text }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new EmbedError('EMBED_UNREACHABLE', `Cannot reach ${url}: ${(err as Error).message}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EmbedError('EMBED_HTTP_' + res.status, `Embedding endpoint returned ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json().catch(() => ({} as any));
  const vec: unknown = (json as any).embedding;
  if (!Array.isArray(vec) || !vec.every((n) => typeof n === 'number')) {
    throw new EmbedError('EMBED_BAD_SHAPE', 'Response did not include a number[] `embedding` field');
  }
  if (vec.length !== cfg.dim) {
    throw new EmbedError(
      'EMBED_WRONG_DIM',
      `Model ${cfg.model} returned ${vec.length}-dim vector; EMBED_DIM is ${cfg.dim} (migration 246 columns are vector(768))`,
    );
  }
  return vec as number[];
}

/**
 * Serialise a JS number[] for pg's vector column. pgvector accepts the
 * literal form '[0.1,0.2,...]'. Kept as a helper so callers don't roll
 * their own (a wrong format silently fails as a text cast).
 */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

/**
 * Deterministic normalisation — lowercase, collapse whitespace, strip
 * common separators. Used before embedding so 'TypeScript / Node.js' and
 * 'TypeScript/Node.js' land at the same canonical_form and dedup exactly
 * without ever spending an embedding call.
 */
export function canonicalizeSkill(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\/\\|+,;()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
