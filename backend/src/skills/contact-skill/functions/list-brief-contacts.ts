/**
 * contact-skill: list_brief_contacts
 *
 * The named_contacts array on a brief, ready for a human to rule on.
 *
 * Each entry comes back with the four things the reviewer needs to make a
 * ruling and nothing else:
 *
 *   · what the brief said (name, title, address)
 *   · whether it evidences a reachable channel (R-C2)
 *   · whether it has already been promoted (idempotency, plainly)
 *   · what the URL evidencing this person is
 *
 * This is what the dossier's "the person" panel reads from. The screen
 * itself is the CONTACTS_PROPOSED human-in-the-loop moment — the human
 * confirms, corrects, or rejects, and the ruling calls promote_from_brief.
 */

import { SkillContext } from '../../../shared/types';

interface ListParams {
  brief_id: number;
}

interface NamedContact {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
}

export async function list_brief_contacts(params: ListParams, ctx: SkillContext) {
  const briefId = Number(params.brief_id);
  if (!Number.isFinite(briefId)) throw new Error('brief_id is required');

  const briefRes = await ctx.db.query<{
    id: string;
    prospect_id: string;
    named_contacts: NamedContact[];
    domain: string | null;
    status: string;
  }>(
    `SELECT id::text, prospect_id::text, named_contacts, domain, status
       FROM gt_account_briefs
      WHERE id = $brief_id AND tenant_id = $tenant_id AND is_live = $is_live`,
    { brief_id: briefId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
  );
  if (!briefRes.rows[0]) throw new Error('No such brief.');

  const brief = briefRes.rows[0];
  const named = Array.isArray(brief.named_contacts) ? brief.named_contacts : [];
  const evidenceUrl = brief.domain ? `https://${brief.domain}` : null;

  // Which entries have ALREADY been promoted, keyed by (brief, index).
  // Read once rather than per-entry so a brief with twenty entries is one
  // query rather than twenty.
  const existingRes = await ctx.db.query<{ id: string; named_index: number }>(
    `SELECT id::text, (raw->>'named_index')::int AS named_index
       FROM gt_contacts
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND brief_id = $brief_id`,
    { tenant_id: ctx.tenant_id, is_live: ctx.is_live, brief_id: briefId },
  );
  const promoted = new Map<number, number>(
    existingRes.rows.map((r) => [Number(r.named_index), Number(r.id)]));

  const entries = named.map((raw, i) => {
    const entry = raw ?? {};
    const email = clean(entry.email);
    const phone = clean(entry.phone);
    const name = clean(entry.name);
    return {
      named_index: i,
      name,
      title: clean(entry.title),
      email,
      phone,
      /** The URL that would ride onto the channels — the brief's own site. */
      source_url: evidenceUrl,
      /** R-C2 pre-check, shown to the reviewer. */
      has_channel: Boolean(email || phone),
      /** R-C1 pre-check. A row with no name cannot be promoted. */
      has_name: Boolean(name),
      /** Whether promote_from_brief will confirm the address gate as-is. */
      addressable: Boolean(name && (email || phone)),
      promoted_contact_id: promoted.get(i) ?? null,
    };
  });

  return {
    brief: {
      id: Number(brief.id),
      prospect_id: Number(brief.prospect_id),
      status: brief.status,
      named_count: named.length,
    },
    entries,
    /**
     * R-C1 as a header on the response. A brief that named nobody cannot
     * yield anybody; the caller needs to know before drawing a screen
     * that will only ever show "no entries".
     */
    empty_reason: named.length === 0
      ? 'This brief named nobody. Add a contact by hand or research again — the flow will not invent one.'
      : null,
    recipe: 'contact-brief-list' as const,
  };
}

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^(not stated|not specified|not available|unknown|n\/?a|none|nil|null|-)$/i.test(s)) return null;
  return s;
}
