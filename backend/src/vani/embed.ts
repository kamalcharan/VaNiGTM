/**
 * Text embedding — 768-dim vectors for the semantic layer.
 *
 * One primary path (Ollama-compatible endpoint, same LLM_PRIMARY_URL as the
 * chat client). No silent fallback if the endpoint is unreachable or the
 * model is missing — the caller sees the real cause and stops, per
 * VaNiGTM rule 12.
 *
 * ── Model choice ─────────────────────────────────────────────────────────
 * Default is `nomic-embed-text` (768-dim, no auth, runs on Ollama beside
 * the chat model). Override with EMBED_MODEL env if the tenant deployment
 * uses a different one. Dimension MUST match the vector(768) column shape
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

const EMBED_URL   = process.env.LLM_PRIMARY_URL   ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL       ?? 'nomic-embed-text';
const EMBED_KEY   = process.env.LLM_PRIMARY_KEY   ?? '';
const EMBED_TIMEOUT_MS = parseInt(process.env.EMBED_TIMEOUT_MS ?? '30000', 10);

/** Dimension the vector(768) columns expect. Kept as a constant so the
 *  runtime check catches a wrong-model deployment loudly instead of
 *  letting pgvector reject at insert. */
export const EMBED_DIM = 768;

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
  const url = `${EMBED_URL.replace(/\/$/, '')}/api/embeddings`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(EMBED_KEY ? { Authorization: `Bearer ${EMBED_KEY}` } : {}),
      },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
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
  if (vec.length !== EMBED_DIM) {
    throw new EmbedError(
      'EMBED_WRONG_DIM',
      `Model ${EMBED_MODEL} returned ${vec.length}-dim vector; migration 246 expects ${EMBED_DIM}`,
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
