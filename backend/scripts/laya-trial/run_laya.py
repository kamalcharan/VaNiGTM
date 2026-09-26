"""Ask Laya the three decisions over every row of the sample files.

    pip install laya            # Linux / Windows / Intel Mac, CPU is fine
    pip install laya-mlx        # Apple Silicon (faster); auto-detected
    python run_laya.py ftcci-sample.jsonl provider-sample.jsonl

Writes laya-answers.jsonl: one line per row with the answers, the
probabilities, and the wall time. Nothing is sent anywhere.
"""
import json, os, sys, time
os.chdir(os.path.dirname(os.path.abspath(__file__)))   # samples and answers live beside the scripts, not in the shell's cwd
from questions import state_for, laya_questions

files = sys.argv[1:] or ["ftcci-sample.jsonl", "provider-sample.jsonl"]

try:
    import laya_mlx as laya          # Apple Silicon
    agent = laya.load("convaiinnovations/laya", subfolder="multilingual", dtype="float16")
    backend = "laya-mlx"
except ImportError:
    import laya                      # PyTorch, CPU ok
    agent = laya.load("convaiinnovations/laya", subfolder="multilingual")
    backend = "laya"
# multilingual: 1,024-token window and Indian-English business strings are
# closer to its training mix than the English checkpoint's.

missing = [fn for fn in files if not os.path.exists(fn)]
if missing:
    raise SystemExit(f"missing sample file(s): {', '.join(missing)} — copy them into this folder "
                     "(they are gitignored data; see README.md)")
rows = [json.loads(l) for fn in files for l in open(fn, encoding="utf-8") if l.strip()]
print(f"{backend}: {len(rows)} rows")

out = open("laya-answers.jsonl", "w", encoding="utf-8")
t_all = time.perf_counter()
for i, row in enumerate(rows, 1):
    t0 = time.perf_counter()
    res = agent.predict(state_for(row), laya_questions(row))
    ms = (time.perf_counter() - t0) * 1000
    a = res["answers"]
    rec = {
        "id": row["id"], "model": backend, "ms": round(ms, 1),
        "industry": a["industry"]["choice"],
        "industry_p": round(max(a["industry"]["probabilities"].values()), 3),
        "industry_top3": sorted(a["industry"]["probabilities"].items(), key=lambda kv: -kv[1])[:3],
        "is_company": a["is_company"]["noul"] >= 0.5,
        "is_company_p": round(a["is_company"]["noul"], 3),
        "domain_match": (a["domain_match"]["noul"] >= 0.5) if "domain_match" in a else None,
        "domain_match_p": round(a["domain_match"]["noul"], 3) if "domain_match" in a else None,
    }
    out.write(json.dumps(rec, ensure_ascii=False) + "\n")
    if i % 50 == 0:
        print(f"  {i}/{len(rows)}  {ms:.0f} ms last")
out.close()
total = time.perf_counter() - t_all
print(f"done: {len(rows)} rows in {total:.1f}s  ({total/len(rows)*1000:.0f} ms/row)  → laya-answers.jsonl")
