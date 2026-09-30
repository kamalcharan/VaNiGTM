# Exporting real fixture material from production (C2 / C3)

"Fixtures are real: a redacted crawl, a real JD, a real member row — never
synthetic prose that flatters the prompt" (AGENTS.md §7). Claude sessions
cannot reach production, so the material comes from this read-only export.
It writes one JSON file; nothing in the database changes.

Run on the Main VPS:

```bash
docker exec -i vani-backend node - > /tmp/fixture-material.json <<'EOF2'
const { Client } = require('pg');
// The owner's URL when the runtime is vanigtm_app (RLS would hide other
// tenants' rows from a context-free read); DB_PRIMARY otherwise.
const url = process.env.DB_MIGRATE || process.env.DB_PRIMARY;
const c = new Client({ connectionString: url,
  ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const scrub = (s) => (s || '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
  .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
(async () => {
  await c.connect();
  // 1. Website crawls that were read successfully — the profile drafter and
  //    the ingestion extractor are both fed exactly this text.
  const crawls = await c.query(`
    SELECT s.url, s.display_name, length(s.raw_text) AS chars, s.raw_text
      FROM gt_kb_sources s
     WHERE s.source_type = 'url' AND s.status = 'complete'
       AND length(coalesce(s.raw_text, '')) > 500
     ORDER BY s.created_at DESC LIMIT 4`);
  // 2. Common-pool company rows with a description — the industry /
  //    is_individual classification pass. Company fields only, no people.
  const companies = await c.query(`
    SELECT name, industry_raw, description, city, website
      FROM gt_universe_company_sources
     WHERE coalesce(description, industry_raw) IS NOT NULL
     ORDER BY random() LIMIT 30`);
  // 3. Published JDs — Vara's JD import / extraction.
  const jds = await c.query(`
    SELECT jd.title, v.facts, v.must_haves, v.knockouts
      FROM vara_jd jd JOIN vara_jd_version v ON v.id = jd.current_version_id
     WHERE jd.status = 'published' ORDER BY jd.created_at DESC LIMIT 5`);
  console.log(JSON.stringify({
    exported_at: new Date().toISOString(),
    crawls: crawls.rows.map((r) => ({ ...r, raw_text: scrub(r.raw_text) })),
    companies: companies.rows.map((r) => ({ ...r, description: scrub(r.description) })),
    jds: jds.rows,
  }, null, 2));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
EOF2
ls -l /tmp/fixture-material.json
```

Emails and phone numbers are replaced with `[email]` / `[phone]` before the
file is written. Read it before sharing it; remove anything you would not want
committed, because the fixtures built from it are checked into the repo
(`src/skills/<skill>/evals/`).

Then get the file to the session: copy it to your laptop
(`scp root@<vps>:/tmp/fixture-material.json .`) and either attach it, or
commit it on the working branch as `documents/fixtures-inbox/fixture-material.json`
(the inbox is deleted once the fixtures are written).
