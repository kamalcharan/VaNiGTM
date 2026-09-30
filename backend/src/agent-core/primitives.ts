/**
 * The three shared primitives (AGENTS.md §5, POA C2): EXTRACT, CLASSIFY, DRAFT.
 *
 * Each is a contract builder: a skill supplies what is specific to it (the
 * fields, the labels, what the prose is for) and gets a contract with a
 * standard answer shape and a grounding check that runs in code. Preferred
 * over a bespoke prompt — a new prompt has to justify why none of these fit.
 *
 * The checks are the point:
 *   extract   every fact must quote EVIDENCE that is really in the source text
 *             (whitespace- and case-insensitive). A fact without it is
 *             rejected with EVIDENCE_NOT_IN_SOURCE — a model that paraphrases
 *             its evidence has stopped quoting and started asserting.
 *   classify  the label is one of the declared ones (the schema enforces it)
 *             and confidence is in [0, 1].
 *   draft     the prose may cite only the fact ids it was given; an unknown
 *             id is UNKNOWN_FACT_ID, and a draft that cites none is flagged
 *             NO_FACTS_CITED, because prose grounded in nothing is invented.
 *
 * Rejections are returned, never swallowed (rule 12). The caller decides what
 * a rejection means for its run, and says so in the run's steps.
 */
import { z } from 'zod';
import { defineContract, type PromptContract, type Rejection } from './contract';

/* ── EXTRACT ─────────────────────────────────────────────────────────────── */

export interface ExtractedFact<F extends string = string> {
  field: F;
  value: string;
  /** A verbatim span of the source that supports the value. */
  evidence: string;
  /** 0–1, the model's own confidence; reported, never trusted alone. */
  confidence: number;
}

export interface ExtractAnswer<F extends string = string> { facts: ExtractedFact<F>[] }

/** Lowercase, collapse whitespace, unify quotes/dashes — what "appears in the source" means. */
export function normaliseForEvidence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractContract<F extends string, V extends string = never>(spec: {
  key: string;
  purpose: string;
  /** What the source is, in a few words: "a company's website text". */
  sourceIs: string;
  /** field → what it means. The answer may use only these fields. */
  fields: Record<F, string>;
  /** Extra instructions specific to this extraction. */
  guidance?: string;
  answerTokens: number;
  /** Extra variables beyond {{source}}, used in `guidance` or `context`. */
  extraVariables?: readonly V[];
  /** Optional preamble shown before the source, may use extra variables. */
  context?: string;
}): PromptContract<'source' | V, ExtractAnswer<F>> {
  const fieldNames = Object.keys(spec.fields) as F[];
  if (!fieldNames.length) throw new Error(`${spec.key}: extract needs at least one field`);
  const Fact = z.object({
    field: z.enum(fieldNames as [F, ...F[]]),
    value: z.string().trim().min(1).max(2000),
    evidence: z.string().trim().min(1).max(1000),
    confidence: z.number().min(0).max(1),
  });
  const output = z.object({ facts: z.array(Fact).max(200) }) as unknown as z.ZodType<ExtractAnswer<F>>;
  const fieldList = fieldNames.map((f) => `- ${f}: ${spec.fields[f]}`).join('\n');

  return defineContract<'source' | V, ExtractAnswer<F>>({
    key: spec.key,
    purpose: spec.purpose,
    variables: ['source', ...(spec.extraVariables ?? [])] as readonly ('source' | V)[],
    system:
`You extract facts from ${spec.sourceIs}. Extract ONLY what the text states.

Fields you may extract:
${fieldList}
${spec.guidance ? `\n${spec.guidance}\n` : ''}
For every fact give:
- "field": one of the field names above
- "value": the fact, short and concrete
- "evidence": an EXACT quote from the text that supports it — copied, not paraphrased (at most two sentences)
- "confidence": 0 to 1, how sure you are the text states this

A fact you cannot quote evidence for must be left out. Never invent. An empty list is a correct answer when the text states nothing relevant.

Answer with ONLY a JSON object inside <facts></facts> tags:
<facts>
{"facts": [{"field": "...", "value": "...", "evidence": "...", "confidence": 0.9}]}
</facts>`,
    user: `${spec.context ? `${spec.context}\n\n` : ''}Text:\n\n{{source}}`,
    output,
    tag: 'facts',
    answerTokens: spec.answerTokens,
    check: (answer, vars) => {
      const source = normaliseForEvidence(String((vars as Record<string, unknown>).source ?? ''));
      const kept: ExtractedFact<F>[] = [];
      const rejected: Rejection[] = [];
      for (const f of answer.facts) {
        if (source.includes(normaliseForEvidence(f.evidence))) kept.push(f);
        else rejected.push({ item: f, reason: 'EVIDENCE_NOT_IN_SOURCE', detail: `"${f.evidence.slice(0, 120)}" is not in the text` });
      }
      return { answer: { facts: kept }, rejected };
    },
  });
}

/* ── CLASSIFY ────────────────────────────────────────────────────────────── */

export interface ClassifyAnswer<L extends string = string> {
  label: L;
  confidence: number;
  /** One sentence, naming what in the input decided it. */
  reason: string;
}

export function classifyContract<L extends string, V extends string = never>(spec: {
  key: string;
  purpose: string;
  /** What is being classified: "one company record". */
  itemIs: string;
  /** label → what it means. Exactly one is chosen. */
  labels: Record<L, string>;
  guidance?: string;
  answerTokens: number;
  extraVariables?: readonly V[];
  context?: string;
}): PromptContract<'item' | V, ClassifyAnswer<L>> {
  const labelNames = Object.keys(spec.labels) as L[];
  if (labelNames.length < 2) throw new Error(`${spec.key}: classify needs at least two labels`);
  const output = z.object({
    label: z.enum(labelNames as [L, ...L[]]),
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(500),
  }) as unknown as z.ZodType<ClassifyAnswer<L>>;
  const labelList = labelNames.map((l) => `- ${l}: ${spec.labels[l]}`).join('\n');

  return defineContract<'item' | V, ClassifyAnswer<L>>({
    key: spec.key,
    purpose: spec.purpose,
    variables: ['item', ...(spec.extraVariables ?? [])] as readonly ('item' | V)[],
    system:
`You classify ${spec.itemIs} into exactly one of these labels:
${labelList}
${spec.guidance ? `\n${spec.guidance}\n` : ''}
Choose the single best label. "confidence" is 0 to 1. "reason" is one sentence naming what in the input decided it — not a restatement of the label.

Answer with ONLY a JSON object inside <label></label> tags:
<label>
{"label": "...", "confidence": 0.8, "reason": "..."}
</label>`,
    user: `${spec.context ? `${spec.context}\n\n` : ''}Input:\n\n{{item}}`,
    output,
    tag: 'label',
    answerTokens: spec.answerTokens,
  });
}

/* ── DRAFT ───────────────────────────────────────────────────────────────── */

/** What a draft is written FROM: facts the caller already holds, each with an id. */
export interface DraftFact { id: string; text: string }

export interface DraftAnswer {
  text: string;
  /** Ids of the facts the text relies on. */
  facts_used: string[];
}

export function draftContract<V extends string = never>(spec: {
  key: string;
  purpose: string;
  /** What to write: "a two-sentence company summary for a sales deck". */
  write: string;
  guidance?: string;
  /** Hard cap on the prose, in characters. */
  maxChars: number;
  answerTokens: number;
  extraVariables?: readonly V[];
}): PromptContract<'facts' | 'voice' | V, DraftAnswer> {
  const output = z.object({
    text: z.string().trim().min(1).max(spec.maxChars),
    facts_used: z.array(z.string().min(1)).max(100),
  }) as unknown as z.ZodType<DraftAnswer>;

  return defineContract<'facts' | 'voice' | V, DraftAnswer>({
    key: spec.key,
    purpose: spec.purpose,
    variables: ['facts', 'voice', ...(spec.extraVariables ?? [])] as readonly ('facts' | 'voice' | V)[],
    system:
`You write ${spec.write}, using ONLY the facts provided. Each fact has an id.

Rules:
- Say nothing the facts do not support. No numbers, names, customers or claims that are not in them.
- Write in this voice: {{voice}}
- At most ${spec.maxChars} characters.
${spec.guidance ? `${spec.guidance}\n` : ''}
List in "facts_used" the id of every fact the text relies on.

Answer with ONLY a JSON object inside <draft></draft> tags:
<draft>
{"text": "...", "facts_used": ["f1", "f2"]}
</draft>`,
    user: 'Facts:\n\n{{facts}}',
    output,
    tag: 'draft',
    answerTokens: spec.answerTokens,
    check: (answer, vars) => {
      const given = new Set(
        (Array.isArray((vars as Record<string, unknown>).facts) ? (vars as Record<string, unknown>).facts as DraftFact[] : [])
          .map((f) => f.id),
      );
      const rejected: Rejection[] = [];
      const used = answer.facts_used.filter((id) => {
        if (given.has(id)) return true;
        rejected.push({ item: id, reason: 'UNKNOWN_FACT_ID', detail: `the draft cites "${id}", which it was not given` });
        return false;
      });
      if (!used.length) {
        rejected.push({ item: answer.text, reason: 'NO_FACTS_CITED', detail: 'the draft relies on none of the facts it was given' });
      }
      return { answer: { text: answer.text, facts_used: used }, rejected };
    },
  });
}
