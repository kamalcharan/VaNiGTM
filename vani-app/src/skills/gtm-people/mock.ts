/**
 * People — the reference surface over gt_contacts. Read-only here: a person
 * enters the audience through G1 (promote_from_brief) and is worked through
 * G2; this is where you LOOK AT them. Shapes follow contact-skill's own
 * contract (SKILL.md: get_contacts, get_contact) so integration is a match,
 * not a rename.
 */
import { promotedPeople } from '@/skills/gtm-audience/mock';

export interface ContactRow {
  id: string;
  contact_no: string;
  name: string;
  job_title: string | null;
  company_name: string | null;
  location: string | null;
  source: string;
  score: number | null;
  primary_email: string | null;
  primary_mobile: string | null;
  created_at: string;
}

export interface Channel { type: 'email' | 'linkedin' | 'whatsapp' | 'mobile'; value: string; verified: boolean; }

export interface Touch { at: string; channel: string; kind: string; outcome: string | null; }

export interface ContactDetail extends ContactRow {
  channels: Channel[];
  /** The company brief this person came from, for the link back. */
  prospect_id: string | null;
  prospect_ref: string | null;
  /** From gt_touch_log. Empty until something is in motion. */
  touches: Touch[];
  /** From gt_journeys. Null until G2 puts them in motion. */
  journey: { stage: string; since: string } | null;
}

/** "R. Menon" → "r.menon" — letters only per word, joined by one dot. */
const handle = (name: string) => name.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z]/g, '')).filter(Boolean).join('.');

function rows(): ContactDetail[] {
  const today = new Date().toISOString();
  return promotedPeople().map((p) => ({
    id: p.id,
    contact_no: p.contact_ref,
    name: p.name,
    job_title: p.title,
    company_name: p.company?.name ?? null,
    location: p.company?.city ?? null,
    source: 'brief · ' + (p.company?.source_label ?? 'research'),
    score: null,
    primary_email: p.email === 'found' ? `${handle(p.name)}@${(p.company?.name ?? 'example').toLowerCase().split(' ')[0]}.example` : null,
    primary_mobile: null,
    created_at: today,
    channels: [
      ...(p.email === 'found' ? [{ type: 'email' as const, value: `${handle(p.name)}@${(p.company?.name ?? 'example').toLowerCase().split(' ')[0]}.example`, verified: false }] : []),
      ...(p.linkedin ? [{ type: 'linkedin' as const, value: `linkedin.com/in/${handle(p.name).replace(/\./g, '')}`, verified: false }] : []),
    ],
    prospect_id: p.prospect_id,
    prospect_ref: p.company?.ref ?? null,
    touches: [],
    journey: null,
  }));
}

export const PEOPLE_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'contact-skill.get_contacts': (p) => {
    const q = String(p.search ?? '').trim().toLowerCase();
    const all = rows();
    const contacts = q ? all.filter((c) => [c.name, c.company_name, c.job_title, c.primary_email].some((v) => v?.toLowerCase().includes(q))) : all;
    return { contacts: contacts.map(({ channels: _c, touches: _t, journey: _j, prospect_id: _p, prospect_ref: _r, ...row }) => row), total: contacts.length, recipe: 'contact-list' };
  },
  'contact-skill.get_contact': (p) => {
    const c = rows().find((x) => x.id === p.contact_id || x.contact_no === p.contact_id);
    return c ? { contact: c, recipe: 'contact-profile' } : null;
  },
};
