// api/health.js
// GET /api/health — pings the Qwen host. The playground polls this every
// 30s to decide DEMO MODE vs ADVISOR LIVE; it never sees the key or URL.
//
// Tries llama.cpp's native lightweight GET /health first — unlike a chat
// completion, it doesn't consume one of the host's 4 inference slots, so it
// stays fast and honest even when the host is busy serving real generations.
// A generation-based check (the previous approach) can't tell "the host is
// down" apart from "the host is busy and this ping is queued behind other
// work" — including, previously, this same health check's own load, polled
// every 30 seconds. If the lightweight endpoint isn't supported on this
// build (404, or any failure), falls back to the proven POST
// /v1/chat/completions check the infra doc actually documents.

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
    const lightUrl = url.replace(/\/v1\/chat\/completions\/?$/, '/health');
    const r = await fetch(lightUrl, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      res.status(200).json({ ok: true, via: 'lightweight' });
      return;
    }
    // Non-OK (e.g. 404 if this build doesn't implement it) — fall through.
  } catch {
    // Connection-level failure on the lightweight path — also fall through,
    // in case it's specific to that path rather than the host being down.
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
      res.status(200).json({ ok: true, via: 'generation' });
      return;
    }
    const bodyText = await r.text().catch(() => '');
    res.status(503).json({ ok: false, error: `HTTP ${r.status}`, detail: bodyText.slice(0, 200) });
  } catch (err) {
    res.status(503).json({ ok: false, error: err?.name || 'fetch failed', detail: String(err?.message || err).slice(0, 200) });
  }
}
