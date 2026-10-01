// api/health.js
// GET /api/health — pings the model host. The playground polls this every
// 30s to decide DEMO MODE vs ADVISOR LIVE; it never sees the key or URL.
//
// Despite the QWEN_* names (kept so no new Vercel env vars are needed after
// switching providers), these hold Anthropic credentials — see the header
// comment in api/advisor.js. A minimal generation call is enough of a
// health check here: unlike the self-hosted VPS this replaced (CPU-only,
// only 4 parallel inference slots, where a generation-based ping competed
// with real advisor traffic for the same capacity), Anthropic's hosted API
// has no comparable per-request slot contention at this traffic volume.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const url = process.env.QWEN_URL;
  const key = process.env.QWEN_KEY;
  const model = process.env.QWEN_MODEL || 'claude-haiku-4-5-20251001';
  if (!url || !key) {
    res.status(503).json({ ok: false, error: 'not configured' });
    return;
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      res.status(200).json({ ok: true });
      return;
    }
    const bodyText = await r.text().catch(() => '');
    res.status(503).json({ ok: false, error: `HTTP ${r.status}`, detail: bodyText.slice(0, 200) });
  } catch (err) {
    res.status(503).json({ ok: false, error: err?.name || 'fetch failed', detail: String(err?.message || err).slice(0, 200) });
  }
}
