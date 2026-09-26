"""Ask Haiku the SAME three decisions, for comparison.

    pip install anthropic
    ANTHROPIC_API_KEY=... python run_haiku.py ftcci-sample.jsonl provider-sample.jsonl

Writes haiku-answers.jsonl with the answers, latency and token usage, and
prints the spend. 627 rows is well under a dollar.
"""
import json, sys, time
import anthropic
from questions import haiku_prompt, HAIKU_SCHEMA

MODEL = "claude-haiku-4-5"
IN_PER_M, OUT_PER_M = 1.00, 5.00          # USD per million tokens

files = sys.argv[1:] or ["ftcci-sample.jsonl", "provider-sample.jsonl"]
rows = [json.loads(l) for fn in files for l in open(fn, encoding="utf-8") if l.strip()]
client = anthropic.Anthropic()
out = open("haiku-answers.jsonl", "w", encoding="utf-8")
tin = tout = 0
t_all = time.perf_counter()
for i, row in enumerate(rows, 1):
    t0 = time.perf_counter()
    try:
        resp = client.messages.create(
            model=MODEL, max_tokens=256,
            system="You are a careful data classifier. Answer only with the JSON asked for.",
            messages=[{"role": "user", "content": haiku_prompt(row)}],
            output_config={"format": {"type": "json_schema", "schema": HAIKU_SCHEMA}},
        )
    except anthropic.RateLimitError:
        time.sleep(5); continue
    except anthropic.APIStatusError as e:
        print(f"  {row['id']}: {e.status_code} {e.message}"); continue
    ms = (time.perf_counter() - t0) * 1000
    tin += resp.usage.input_tokens; tout += resp.usage.output_tokens
    text = next(b.text for b in resp.content if b.type == "text")
    a = json.loads(text)
    out.write(json.dumps({"id": row["id"], "model": MODEL, "ms": round(ms, 1),
                          "industry": a["industry"], "is_company": a["is_company"],
                          "domain_match": a["domain_match"]}, ensure_ascii=False) + "\n")
    if i % 50 == 0:
        print(f"  {i}/{len(rows)}")
out.close()
total = time.perf_counter() - t_all
cost = tin / 1e6 * IN_PER_M + tout / 1e6 * OUT_PER_M
print(f"done: {len(rows)} rows in {total:.0f}s ({total/len(rows)*1000:.0f} ms/row); "
      f"{tin} in + {tout} out tokens = ${cost:.2f}  → haiku-answers.jsonl")
