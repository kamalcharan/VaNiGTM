/**
 * Prompt contracts (POA C2, AGENTS.md §5).
 *
 * A prompt key is `<skill>.<name>` and it has a CONTRACT: the variables it
 * takes, the output schema its answer must satisfy, the tag the answer comes
 * in, and how many tokens the answer may use. Every structured call goes
 * through `runContract`, which renders the template, calls
 * `callLLMValidated` (fences stripped, tag read, JSON parsed, schema checked,
 * one correction retry, then LLM_VALIDATION_FAILED — never a failover), and
 * then runs the contract's own CHECK in code.
 *
 * The check is the part a model cannot talk its way past. Schema validation
 * proves the answer has the right SHAPE; the check proves it is GROUNDED — an
 * extracted fact whose evidence is not in the source, a draft citing a fact id
 * it was never given. What fails the check is returned as `rejected` with the
 * reason, never dropped silently and never kept (rule 12).
 *
 * Fixtures: every contract ships real input → expected answer pairs in its
 * skill's `evals/<name>.json` (contract-fixtures.ts). "No fixture, no merge."
 *
 * What this deliberately does not do:
 *   - store prompt bodies in gt_prompts. The template lives with its schema,
 *     in code, versioned by git. Moving bodies to the store (tenant overrides,
 *     append-only versions) is a later step; a store row silently replacing a
 *     code body would be two sources of truth for one key.
 *   - trim variables to fit the window. Callers size pasted text with
 *     charBudgetFor(…, fixedTextOf(contract)) and say what they trimmed.
 */
import type { z } from 'zod';
import { callLLMValidated, type LLMCallOptions } from './llm.client';

export interface Rejection {
  /** The offending piece of the answer, as returned. */
  item: unknown;
  /** Machine-readable: EVIDENCE_NOT_IN_SOURCE, UNKNOWN_FACT_ID, … */
  reason: string;
  detail?: string;
}

export interface CheckResult<T> {
  /** The answer with every rejected piece removed. */
  answer: T;
  rejected: Rejection[];
}

export interface PromptContract<V extends string = string, T = unknown> {
  /** `<skill>.<name>`, e.g. `profile-skill.draft_from_site`. */
  key: string;
  /** One sentence: what the call is for. Shown in eval reports. */
  purpose: string;
  /** Every `{{name}}` the templates use — and nothing else. */
  variables: readonly V[];
  system: string;
  user: string;
  /** The zod schema the parsed answer must satisfy. */
  output: z.ZodType<T>;
  /** The answer is JSON inside <tag>…</tag>. */
  tag: string;
  /** Tokens reserved for the answer. Part of the contract, versioned with the prompt. */
  answerTokens: number;
  /** Grounding check in code, run after the schema passes. */
  check?: (answer: T, vars: Record<V, unknown>) => CheckResult<T>;
}

export class ContractDefinitionError extends Error {
  constructor(key: string, problem: string) {
    super(`CONTRACT_INVALID: ${key}: ${problem}`);
    this.name = 'ContractDefinitionError';
  }
}

export class ContractVariableError extends Error {
  constructor(readonly key: string, readonly variables: string[]) {
    super(`CONTRACT_VARIABLE_MISSING: ${key} needs ${variables.map((v) => `{{${v}}}`).join(', ')}`);
    this.name = 'ContractVariableError';
  }
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const KEY = /^[a-z0-9-]+\.[a-z0-9_]+$/;

const tokensIn = (template: string): Set<string> =>
  new Set([...template.matchAll(TOKEN)].map((m) => m[1]));

const registry = new Map<string, PromptContract<string, unknown>>();

/**
 * Declare a contract. Refuses, at definition time, a template that uses a
 * variable the contract does not declare, or declares one no template uses —
 * the two ways a prompt and its caller drift apart without anyone noticing.
 */
export function defineContract<V extends string, T>(c: PromptContract<V, T>): PromptContract<V, T> {
  if (!KEY.test(c.key)) throw new ContractDefinitionError(c.key, 'key must be <skill>.<name> (lowercase, - and _)');
  if (!c.tag || !/^[a-z_]+$/.test(c.tag)) throw new ContractDefinitionError(c.key, 'tag must be a lowercase word');
  if (!Number.isInteger(c.answerTokens) || c.answerTokens < 1) {
    throw new ContractDefinitionError(c.key, 'answerTokens must be a whole number ≥ 1');
  }
  const used = new Set([...tokensIn(c.system), ...tokensIn(c.user)]);
  const declared = new Set<string>(c.variables);
  const undeclared = [...used].filter((v) => !declared.has(v));
  const unused = [...declared].filter((v) => !used.has(v));
  if (undeclared.length) throw new ContractDefinitionError(c.key, `templates use undeclared ${undeclared.join(', ')}`);
  if (unused.length) throw new ContractDefinitionError(c.key, `declared but never used: ${unused.join(', ')}`);
  const existing = registry.get(c.key);
  if (existing && existing !== (c as unknown)) throw new ContractDefinitionError(c.key, 'defined twice');
  registry.set(c.key, c as PromptContract<string, unknown>);
  return c;
}

/** Every contract defined so far (the fixture check walks this). */
export function registeredContracts(): PromptContract<string, unknown>[] {
  return [...registry.values()];
}

/** Test seam. */
export function __resetContracts(): void { registry.clear(); }

const asText = (v: unknown): string =>
  v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2);

/**
 * Fill the templates. Every declared variable must be supplied (null counts as
 * supplied — "nothing known" is a real value); a missing one is an error, not
 * an empty string, because a prompt that silently lost its input still gets an
 * answer and the answer looks fine.
 */
export function renderContract<V extends string>(
  c: PromptContract<V, unknown>,
  vars: Record<V, unknown>,
): { system: string; user: string } {
  const missing = c.variables.filter((v) => !(v in (vars as object)));
  if (missing.length) throw new ContractVariableError(c.key, missing);
  const fill = (t: string) => t.replace(TOKEN, (_, name: string) => asText((vars as Record<string, unknown>)[name]));
  return { system: fill(c.system), user: fill(c.user) };
}

/** The contract's templates with every variable empty — what charBudgetFor calls fixed text. */
export function fixedTextOf(c: PromptContract<string, unknown>): string {
  return c.system.replace(TOKEN, '') + c.user.replace(TOKEN, '');
}

export interface ContractRun<T> {
  answer: T;
  rejected: Rejection[];
}

/**
 * Render, call, validate, check. The call options are the usual ones (tenant,
 * pool, run); temperature defaults to the configured one like any other call.
 */
export async function runContract<V extends string, T>(
  c: PromptContract<V, T>,
  vars: Record<V, unknown>,
  call: Omit<LLMCallOptions, 'system' | 'messages' | 'maxTokens'>,
): Promise<ContractRun<T>> {
  const { system, user } = renderContract(c as PromptContract<V, unknown>, vars);
  const parsed = await callLLMValidated<T>(
    { ...call, system, messages: [{ role: 'user', content: user }], maxTokens: c.answerTokens },
    c.output as z.ZodSchema<T>,
    c.tag,
  );
  return c.check ? c.check(parsed, vars) : { answer: parsed, rejected: [] };
}
