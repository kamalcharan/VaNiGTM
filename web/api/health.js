// api/health.js
// GET /api/health — pings the Qwen host. The playground polls this to
// decide DEMO MODE vs ADVISOR LIVE; it never sees the key or the URL.
//
// Uses the same call shape as api/advisor.js (a real /v1/chat/completions
// request, max_tokens:1) rather than GET /v1/models — the infra doc only
// ever documents and tests chat/completions against this host, so this is
// the one call type we know for certain the server supports. On failure the
// response includes the actual error so a bad URL/key/host is visible
// without needing to dig through Vercel's function logs.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const url = process.env.QWEN_URL;
  const key = process.env.QWEN_KEY;
  if (!url || !key) {
    res.status(503).json({ ok: false, error: 'not configured' });
    return;
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || 'qwen3-4b',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
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
