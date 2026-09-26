# Laya trial — is a decision model good enough for the enrichment lane?

Charan, 2026-09-26: "we can run laya in the laptop and decide". This folder is
that trial. It answers one question: **on our own rows, does Laya agree with
Haiku often enough, and know when it does not, to take the classification
half of enrichment off the paid model?**

Laya is an open-weight (Apache 2.0) "typed decision" model from Convai
Innovations: a choice, a rubric score or a yes/no over a piece of text in one
forward pass, no text generation, tens of milliseconds on a CPU. It cannot
write a description; it can decide things. Repo: github.com/NandhaKishorM/laya.

## What is measured

Three decisions per row, the ones the cleanup worker would hand to a cheap lane:

| key | type | question |
|---|---|---|
| `industry` | choice over 19 NACE sections | what does this company do |
| `is_company` | yes/no | is the name an organisation, not a person / category / search phrase |
| `domain_match` | yes/no | does the domain plausibly belong to this company (name + domain only, no crawl) |

Both models see the same state (`questions.state_for`) and the same option
names, so a disagreement is a model difference, not a prompt difference.

Two samples:

- `ftcci-sample.jsonl` — 500 rows from the FTCCI delivery: name, domain,
  email, the free-text BUSINESS string, city. No ground truth; `review.csv`
  is where a person supplies it.
- `provider-sample.jsonl` — 127 rows from the two provider pastes (IT
  services, "growth stage startups"): name, domain, description, size band,
  and the provider's NACE codes. The first code's section is the label for
  `industry`, so accuracy is measurable here, not only agreement.

Both files are data and are gitignored. Bring them to the laptop by hand.

## Run it

```bash
cd backend/scripts/laya-trial
pip install laya anthropic            # Apple Silicon: pip install laya-mlx as well (auto-detected)

python run_laya.py                    # → laya-answers.jsonl, prints ms/row
ANTHROPIC_API_KEY=... python run_haiku.py    # → haiku-answers.jsonl, prints $ (well under $1)
python score.py                       # → the numbers below + review.csv
```

`make_sample.py` regenerates the FTCCI sample from any database that has the
delivery landed (`DB_PRIMARY=... python make_sample.py 500`).

## How to read the result

`score.py` prints, per question, agreement between the two models and, for
the provider rows, each model's accuracy against the NACE label. Then the
part that matters: **Laya's top probability on the rows where it disagreed
with Haiku**, and for thresholds 0.5–0.8 what share of rows Laya would keep
and how often it is wrong on those.

The lane is real if there is a threshold where Laya keeps most rows and
disagrees with Haiku on few of them. Then the design is: Laya decides, and
only its low-confidence rows go to Haiku. If disagreements are spread across
all confidence levels, Laya cannot tell when it is wrong, and it is not a
lane, whatever its headline accuracy.

Rough bars, to be argued with once the numbers exist:

- keeps ≥ 70% of rows at a threshold where it disagrees with Haiku ≤ 10% → build it
- `is_company` and `domain_match` ≥ 90% agreement → those two are Laya's regardless
- provider `industry` accuracy within 5 points of Haiku's → the taxonomy question is Laya's too

`review.csv` holds every disagreement plus 40 agreements with empty `truth_`
columns. Fill them. Agreement with Haiku is not truth, and on FTCCI's business
strings Haiku has not been checked either.

## What this does NOT decide

- The `cleanup` source writing model-derived fields into the pool. That still
  needs an explicit go (CLAUDE.md, "EVERYTHING enters through staging").
- Descriptions. A decision model cannot write one; that stays on Haiku, and
  provider rows arrive with one anyway.
- The taxonomy. NACE sections are used here because the provider labels in
  them; `gt_industries` (migration 194) is the product's, and it is unseeded.
