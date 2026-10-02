/**
 * Which models can each router provider's key call? (release 2, P2-R)
 *
 *   npx tsx scripts/llm-models.ts            every provider in LLM_PROVIDERS
 *   npx tsx scripts/llm-models.ts openrouter  one provider
 *
 * Reads backend/.env. Asks each provider's own /models endpoint with its own
 * key, prints model ids and windows — never a key. For OpenRouter it lists the
 * FREE models only (ids ending in :free), largest window first: a paid model
 * there would spend money with no "paid" switch in front of it.
 *
 * Use it before setting LLM_<CODE>_MODEL: a model the key cannot call is the
 * 404 "model_not_found" the Test button shows.
 */
import 'dotenv/config';

type M = { id: string; context_window?: number; context_length?: number; active?: boolean };

async function list(code: string): Promise<void> {
  const up = code.toUpperCase();
  const url = (process.env[`LLM_${up}_URL`] ?? '').replace(/\/+$/, '');
  const key = process.env[`LLM_${up}_KEY`] ?? '';
  if (!url) { console.log(`\n${code}: LLM_${up}_URL is not set`); return; }
  const r = await fetch(`${url}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  if (!r.ok) { console.log(`\n${code}: ${r.status} ${r.statusText} — ${(await r.text()).slice(0, 200)}`); return; }
  let models = ((await r.json()) as { data?: M[] }).data ?? [];
  const isOpenRouter = /openrouter\.ai/.test(url);
  if (isOpenRouter) models = models.filter((m) => m.id.endsWith(':free'));
  models = models.filter((m) => m.active !== false)
    .sort((a, b) => (b.context_window ?? b.context_length ?? 0) - (a.context_window ?? a.context_length ?? 0));
  const now = process.env[`LLM_${up}_MODEL`] ?? '';
  console.log(`\n${code} — ${models.length} model(s)${isOpenRouter ? ' (free only)' : ''} your key can call; configured: ${now || '(none)'}${now && !models.some((m) => m.id === now) ? '  ← NOT in this list' : ''}`);
  for (const m of models) console.log(`  ${m.id.padEnd(58)} window ${(m.context_window ?? m.context_length ?? 0).toLocaleString('en-US')}`);
}

(async () => {
  const wanted = process.argv[2]
    ? [process.argv[2].toLowerCase()]
    : (process.env.LLM_PROVIDERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!wanted.length) { console.log('LLM_PROVIDERS is empty — nothing to list.'); return; }
  for (const c of wanted) {
    try { await list(c); } catch (e) { console.log(`\n${c}: could not reach it — ${(e as Error).message}`); }
  }
})();
