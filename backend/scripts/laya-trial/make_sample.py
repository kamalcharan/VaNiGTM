"""Pull a random sample of pool rows into ftcci-sample.jsonl.

    DB_PRIMARY=postgresql://... python make_sample.py [n]

Reads gt_universe_company_sources (the FTCCI delivery after landing). The
output is DATA and is gitignored; carry it to the laptop by hand.
"""
import json, os, sys
import psycopg2  # pip install psycopg2-binary

n = int(sys.argv[1]) if len(sys.argv) > 1 else 500
dsn = os.environ["DB_PRIMARY"]
sql = """
  SELECT id, name, domain_normalized, email, industry_raw, city
    FROM gt_universe_company_sources
   WHERE industry_raw IS NOT NULL
   ORDER BY md5(id::text)      -- stable pseudo-random order, re-runnable
   LIMIT %s
"""
with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
    cur.execute(sql, (n,))
    with open("ftcci-sample.jsonl", "w", encoding="utf-8") as f:
        for rid, name, dom, email, biz, city in cur.fetchall():
            f.write(json.dumps({
                "id": f"ftcci:{rid}", "source": "ftcci", "name": name,
                "domain": dom, "email": (email or "").split(";")[0].strip() or None,
                "industry_raw": biz, "city": city,
                "label_industry": None,     # no ground truth: hand-label review.csv
            }, ensure_ascii=False) + "\n")
print(f"wrote ftcci-sample.jsonl ({n} rows)")
