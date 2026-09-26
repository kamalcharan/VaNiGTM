"""Compare the two answer files and print the numbers that decide the lane.

    python score.py

Reads the sample files (for labels) and both answer files. Prints, per
question: agreement between Laya and Haiku, and accuracy against ground truth
where one exists (the provider rows carry a NACE section). Writes review.csv
with every disagreement plus a random 40 agreements, one row each, with an
empty `truth` column for a person to fill. Agreement with Haiku is not truth;
the hand-labelled rows are.
"""
import csv, json, os, random
os.chdir(os.path.dirname(os.path.abspath(__file__)))   # samples and answers live beside the scripts, not in the shell's cwd
from collections import Counter, defaultdict

def load(fn):
    try:
        return {r["id"]: r for r in (json.loads(l) for l in open(fn, encoding="utf-8") if l.strip())}
    except FileNotFoundError:
        return {}

rows = {}
for fn in ("ftcci-sample.jsonl", "provider-sample.jsonl"):
    rows.update(load(fn))
laya, haiku = load("laya-answers.jsonl"), load("haiku-answers.jsonl")
ids = [i for i in rows if i in laya and i in haiku]
if not ids:
    raise SystemExit("need both laya-answers.jsonl and haiku-answers.jsonl over the same rows")

print(f"{len(ids)} rows answered by both\n")
for q in ("industry", "is_company", "domain_match"):
    agree = n = 0
    acc = defaultdict(lambda: [0, 0])          # model -> [correct, labelled]
    for i in ids:
        l, h = laya[i].get(q), haiku[i].get(q)
        if l is None and h is None:
            continue
        n += 1; agree += (l == h)
        truth = rows[i].get(f"label_{q}")
        if truth is not None:
            for m, v in (("laya", l), ("haiku", h)):
                acc[m][1] += 1; acc[m][0] += (v == truth)
    line = f"{q:13s} agree {agree}/{n} = {agree/n:.0%}"
    for m, (c, t) in acc.items():
        if t:
            line += f"   {m} vs label {c}/{t} = {c/t:.0%}"
    print(line)

# Laya's confidence on the rows where it disagreed with Haiku: if the
# disagreements sit at low probability, a threshold can route ONLY those to
# Haiku, and that is the whole point of the cheap lane.
dis = [i for i in ids if laya[i]["industry"] != haiku[i]["industry"]]
if dis:
    ps = sorted(laya[i]["industry_p"] for i in dis)
    print(f"\nindustry disagreements: {len(dis)}; Laya top-probability on them: "
          f"min {ps[0]:.2f}  median {ps[len(ps)//2]:.2f}  max {ps[-1]:.2f}")
    for thr in (0.5, 0.6, 0.7, 0.8):
        kept = [i for i in ids if laya[i]["industry_p"] >= thr]
        wrong = [i for i in kept if laya[i]["industry"] != haiku[i]["industry"]]
        print(f"  threshold {thr:.1f}: Laya keeps {len(kept)/len(ids):.0%} of rows, "
              f"disagrees with Haiku on {len(wrong)/max(len(kept),1):.0%} of those")

ms_l = sorted(laya[i]["ms"] for i in ids); ms_h = sorted(haiku[i]["ms"] for i in ids)
print(f"\nlatency per row  laya median {ms_l[len(ms_l)//2]:.0f} ms   haiku median {ms_h[len(ms_h)//2]:.0f} ms")

random.seed(7)
review = dis + random.sample([i for i in ids if i not in dis], min(40, len(ids) - len(dis)))
with open("review.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "name", "domain", "industry_raw_or_description", "laya_industry", "laya_p",
                "haiku_industry", "label_industry", "truth_industry", "laya_is_company", "haiku_is_company",
                "truth_is_company", "laya_domain_match", "haiku_domain_match", "truth_domain_match"])
    for i in review:
        r = rows[i]
        w.writerow([i, r["name"], r.get("domain") or "", r.get("industry_raw") or r.get("description") or "",
                    laya[i]["industry"], laya[i]["industry_p"], haiku[i]["industry"], r.get("label_industry") or "", "",
                    laya[i]["is_company"], haiku[i]["is_company"], "",
                    laya[i]["domain_match"], haiku[i]["domain_match"], ""])
print(f"\nreview.csv: {len(review)} rows ({len(dis)} disagreements + {len(review)-len(dis)} agreements). "
      "Fill the three truth_ columns, then rerun with them as labels if you want accuracy on FTCCI too.")
