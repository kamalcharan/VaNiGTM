/**
 * Reading one pool company's own website — the pure half of the enrichment
 * agent (release 4, prototype documents/prototypes/p2c-pool-enrich.html tab 2):
 *
 *   code   is the site live and not a parked page · which About, Contact and
 *          Products pages to read · company emails, phones and LinkedIn / X /
 *          Facebook links found on them
 *   HIGH   what it does, its industry (on our master), company or individual,
 *          B2B/B2C, size hints, and a small graph — every field with the page
 *          it came from and a confidence
 *   LOW    which of the contacts code found are the company's OWN (not a web
 *          agency's footer credit, a partner, a share button)
 *
 * No database, no network: the agent (pool-enrich.ts) feeds it pages and
 * models. Only ROLE mailboxes (sales@, info@ …) on the company's own domain are
 * ever candidates — a named person's address is people data, which neither
 * enters the pool nor goes to an outside model (router data gate).
 */
import { z } from 'zod';

export const EMPLOYEE_BANDS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'] as const;
export const GRAPH_LABELS = ['Product', 'Feature', 'ICP', 'UseCase', 'PainPoint', 'Differentiator', 'Industry', 'CaseStudy', 'Metric'] as const;

/* ── Is it a real, live site? ──────────────────────────────────────────── */

const PARKED = /(domain (is|may be) for sale|buy this domain|this domain is parked|parked (free|domain|by)|domain has expired|this domain name has been registered|sedoparking|hugedomains|dan\.com|afternic|is available for purchase|future home of something quite cool)/i;

export function parkedReason(text: string): string | null {
  const m = text.match(PARKED);
  return m ? `a parked page ("${m[0]}")` : null;
}

/** Below this much readable text the static page is a JavaScript shell (E6). */
export const MIN_READABLE_CHARS = 200;

/* ── Which pages to read ───────────────────────────────────────────────── */

const KINDS: Array<{ kind: 'about' | 'contact' | 'products'; re: RegExp }> = [
  { kind: 'about', re: /about|company|who-we-are|profile|overview|our-story/i },
  { kind: 'contact', re: /contact|reach-us|enquir|locat/i },
  { kind: 'products', re: /product|service|solution|offering|catalog|what-we-do|capabilit/i },
];

/** From the same-domain links the reader found (best first), one About, one Contact, one Products page. */
export function pickPages(links: string[], limit: number): string[] {
  const out: string[] = [];
  for (const { re } of KINDS) {
    if (out.length >= limit) break;
    const hit = links.find((u) => !out.includes(u) && re.test(new URL(u).pathname));
    if (hit) out.push(hit);
  }
  return out;
}

export const pathOf = (url: string): string => {
  try { return new URL(url).pathname.replace(/\/$/, '') || '/'; } catch { return url; }
};

/* ── Contacts, by code ─────────────────────────────────────────────────── */

const ROLE = /^(info|sales|contact|contactus|enquiry|enquiries|inquiry|inquiries|support|admin|office|hello|mail|marketing|hr|careers|jobs|service|services|export|exports|accounts|purchase|care|customercare|helpdesk|business|bd|corporate|team|reception|orders)$/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export interface Candidate { kind: 'email' | 'phone' | 'linkedin' | 'twitter' | 'facebook'; value: string; where: string }

function where(html: string, index: number, page: string): string {
  const f = html.toLowerCase().lastIndexOf('<footer');
  return f >= 0 && index > f ? 'site footer' : page;
}

/**
 * Every contact a page offers that COULD be the company's: role mailboxes on
 * its own domain, phone numbers, and company social pages. Who they belong to
 * is the LOW call's question; what is never a candidate (a person's mailbox, a
 * share button) is decided here.
 */
export function contactCandidates(pages: Array<{ path: string; html: string; text: string }>, domain: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (c: Candidate, key: string) => { if (!seen.has(key)) { seen.add(key); out.push(c); } };
  for (const p of pages) {
    const hay = `${p.html} ${p.text}`;
    for (const m of hay.matchAll(EMAIL)) {
      const v = m[0].toLowerCase().replace(/^mailto:/, '');
      const [local, host] = v.split('@');
      if (!host || !(host === domain || host.endsWith(`.${domain}`))) continue;
      if (!ROLE.test(local)) continue;   // a named person's mailbox is people data — never a pool fact
      add({ kind: 'email', value: v, where: where(p.html, m.index ?? 0, p.path) }, `e:${v}`);
    }
    const phones = [
      ...[...p.html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].map((m) => ({ raw: m[1], i: m.index ?? 0, src: 'html' })),
      ...[...p.text.matchAll(/(?:\+91[\s.-]*)?\(?0?\d{2,4}\)?[\s.-]*\d{3,4}[\s.-]?\d{4}\b/g)].map((m) => ({ raw: m[0], i: -1, src: 'text' })),
    ];
    for (const ph of phones) {
      const digits = ph.raw.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 13) continue;
      const key = `p:${digits.slice(-10)}`;
      add({ kind: 'phone', value: ph.raw.trim().replace(/\s+/g, ' '), where: ph.src === 'html' ? where(p.html, ph.i, p.path) : p.path }, key);
    }
    for (const m of p.html.matchAll(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9._%-]+/gi)) {
      const v = m[0].replace(/^http:/, 'https:');
      add({ kind: 'linkedin', value: v, where: where(p.html, m.index ?? 0, p.path) }, `l:${v.toLowerCase()}`);
    }
    for (const m of p.html.matchAll(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?=["'?/#\s])/gi)) {
      if (/^(share|intent|home|search|hashtag|i)$/i.test(m[1])) continue;
      add({ kind: 'twitter', value: `https://x.com/${m[1]}`, where: where(p.html, m.index ?? 0, p.path) }, `t:${m[1].toLowerCase()}`);
    }
    for (const m of p.html.matchAll(/https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9.\-]{2,})(?=["'?/#\s])/gi)) {
      if (/^(sharer|share\.php|plugins|tr|dialog|login|groups)$/i.test(m[1]) || /^sharer/i.test(m[1])) continue;
      add({ kind: 'facebook', value: `https://www.facebook.com/${m[1]}`, where: where(p.html, m.index ?? 0, p.path) }, `f:${m[1].toLowerCase()}`);
    }
  }
  return out.slice(0, 24);
}

/* ── LOW: which contacts are the company's own ─────────────────────────── */

export function contactsPrompt(name: string, domain: string, cands: Candidate[]) {
  return {
    system: 'You decide which contact details found on a company\'s own website belong to that company. '
      + 'A web designer\'s credit, a partner, a parent group, a sample or placeholder, or a share button is NOT the company\'s own. '
      + 'Answer only with JSON: {"own": [the exact values that are the company\'s own]}. Copy values exactly; never add one.',
    user: `Company: ${name} (${domain})\n\nFound on its site:\n`
      + cands.map((c) => `- ${c.kind}: ${c.value}  (on ${c.where})`).join('\n'),
  };
}

export function contactsSchema(cands: Candidate[]) {
  const allowed = new Set(cands.map((c) => c.value));
  return z.object({ own: z.array(z.string()) }).refine((v) => v.own.every((x) => allowed.has(x)), {
    message: 'own lists a value that was not among the candidates — copy values exactly, never add one',
  });
}

/* ── HIGH: what the company is ─────────────────────────────────────────── */

export const FACT_FIELDS = ['what_it_does', 'industry', 'is_individual', 'employees_band'] as const;
export type FactField = typeof FACT_FIELDS[number];

export function readingPrompt(name: string, domain: string, industries: string[], sections: Array<{ path: string; text: string }>) {
  return {
    system: 'You read a company\'s own website pages and state facts about that company. Use only the text given. '
      + 'Never guess: when the pages do not say, answer null with a low confidence. Answer only with one JSON object.',
    user: [
      `Company: ${name} (${domain})`,
      '',
      'Answer with this JSON shape:',
      '{"what_it_does": one plain sentence or null, "industry": one name from the INDUSTRIES list or null,',
      ' "is_individual": true if this is one person\'s practice (an advocate, a CA, a consultant under their own name), false if a company, null if unclear,',
      ' "b2b_b2c": "b2b" | "b2c" | "both" | null,',
      ` "employees_band": one of ${EMPLOYEE_BANDS.map((b) => `"${b}"`).join(', ')} or null,`,
      ' "pages": {"what_it_does": path, "industry": path, "is_individual": path, "employees_band": path} — the page each answer came from, or null,',
      ' "confidence": {"what_it_does": 0-1, "industry": 0-1, "is_individual": 0-1, "employees_band": 0-1},',
      ` "graph": {"nodes": [{"label": one of ${GRAPH_LABELS.join('|')}, "name": short, "description": one line}],`,
      '           "edges": [{"from": {"label","name"}, "relationship": "HAS_FEATURE"|"TARGETS"|"SOLVES"|"ADDRESSES", "to": {"label","name"}}]} — at most 10 nodes, only what the pages say}',
      '',
      `INDUSTRIES: ${industries.join('; ')}`,
      '',
      ...sections.map((s) => `=== PAGE ${s.path} ===\n${s.text}`),
    ].join('\n'),
  };
}

const conf = z.number().min(0).max(1).nullable().optional();
const node = z.object({ label: z.string(), name: z.string().min(1).max(200), description: z.string().nullable().optional() });

export function readingSchema(industries: string[], paths: string[]) {
  const ind = new Set(industries.map((s) => s.toLowerCase()));
  const pathSet = new Set(paths);
  return z.object({
    what_it_does: z.string().nullable(),
    industry: z.string().nullable(),
    is_individual: z.boolean().nullable(),
    b2b_b2c: z.enum(['b2b', 'b2c', 'both']).nullable().optional(),
    employees_band: z.string().nullable().optional(),
    pages: z.record(z.string(), z.string().nullable()).optional(),
    confidence: z.object({ what_it_does: conf, industry: conf, is_individual: conf, employees_band: conf }),
    graph: z.object({
      nodes: z.array(node).max(12),
      edges: z.array(z.object({ from: node.pick({ label: true, name: true }), relationship: z.string(), to: node.pick({ label: true, name: true }) })).max(20),
    }).optional(),
  }).superRefine((v, ctx) => {
    if (v.industry && !ind.has(v.industry.toLowerCase())) {
      ctx.addIssue({ code: 'custom', message: `industry "${v.industry}" is not on the INDUSTRIES list — answer one name from it exactly, or null` });
    }
    if (v.employees_band && !(EMPLOYEE_BANDS as readonly string[]).includes(v.employees_band)) {
      ctx.addIssue({ code: 'custom', message: `employees_band "${v.employees_band}" is not one of the bands` });
    }
    for (const [k, p] of Object.entries(v.pages ?? {})) {
      if (p && !pathSet.has(p)) ctx.addIssue({ code: 'custom', message: `pages.${k} "${p}" is not one of the pages given (${paths.join(', ')})` });
    }
    for (const n of v.graph?.nodes ?? []) {
      if (!(GRAPH_LABELS as readonly string[]).includes(n.label)) ctx.addIssue({ code: 'custom', message: `graph node label "${n.label}" is not allowed` });
    }
  });
}

export type Reading = z.infer<ReturnType<typeof readingSchema>>;

/** Fit the site text into the token budget: the home page first, every page a fair share. */
export function budgetSections(sections: Array<{ path: string; text: string }>, chars: number) {
  const out: Array<{ path: string; text: string }> = [];
  let left = chars;
  sections.forEach((s, i) => {
    const share = Math.floor(left / (sections.length - i));
    const t = s.text.slice(0, Math.max(0, share));
    out.push({ path: s.path, text: t });
    left -= t.length;
  });
  return { sections: out, trimmed: sections.reduce((n, s) => n + s.text.length, 0) - out.reduce((n, s) => n + s.text.length, 0) };
}
