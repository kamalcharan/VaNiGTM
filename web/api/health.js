// api/health.js
// GET /api/health — pings the Qwen host. The playground polls this to
// decide DEMO MODE vs ADVISOR LIVE; it never sees the key or the URL.

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
    const modelsUrl = url.replace('/chat/completions', '/models');
    const r = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    res.status(r.ok ? 200 : 503).json({ ok: r.ok });
  } catch {
    res.status(503).json({ ok: false });
  }
}
