'use client';

/**
 * The drawer that opens off one row of the journey board.
 *
 * ── WHAT IT SHOWS, IN THE ORDER THE PILOT NEEDS IT ────────────────────
 *
 *   1. WHAT IS OWED    — the state line the row was ranked by, made
 *                        physical here so the reviewer knows why they
 *                        opened this drawer
 *   2. THE BRIEF       — the argument and its evidence, so R-S1 has
 *                        something to trace against without a second tab
 *   3. THE PERSON      — either the confirmed contact, or the promotable
 *                        candidates from named_contacts (Phase 2's gate)
 *   4. THE STORIES     — earlier ones visible for R-S2 as the writer
 *                        composes; the new one is a form below
 *   5. THE COMPOSE     — the writing surface with a LIVE claim tracer:
 *                        R-S1 rendered as UI (design note §4). Approval
 *                        is blocked while anything asserts something the
 *                        brief cannot support.
 *   6. THE LEDGER      — every state event on this journey, oldest first
 *
 * The trace runs in the browser — R-S1 is a UI check here, not a network
 * round-trip. The approval THEN re-runs it on the server, so the guard is
 * enforced in two places and the browser one is only for latency.
 */

import { useState, useMemo, useEffect } from 'react';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useChannelTypes } from '@/hooks/useChannelTypes';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { VdfLoader } from '@/components/vdf';
import s from './journeys.module.css';

/* ── The tracer (mirrors backend trace.ts to the letter) ─────────────── */

const OURS = /\b(we|we'd|we're|our|ours|us|i|i'd|i'm|my|happy|worth|minutes|call|chat|would you|shall|can i|let me)\b/i;
const STOP = new Set([
  'this','that','with','from','they','their','there','have','been','which',
  'about','into','over','across','were','than','then','what','when','your',
  'yours','after','before','while','because','would','could','should','will','shall',
]);
type Verdict = 'traced' | 'about_us' | 'neutral' | 'unsupported';

function terms(str: string): string[] {
  return str.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w && (/\d/.test(w) || (w.length > 3 && !STOP.has(w))));
}
function isClaim(str: string): boolean {
  if (/\d/.test(str)) return true;
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length >= 4 && words.slice(1).some((w) => /^[A-Z][a-z]/.test(w))) return true;
  return terms(str).length >= 5;
}
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 4);
}
function traceOne(sentence: string, ev: EvidenceLine[]): EvidenceLine | null {
  const t = terms(sentence);
  const best = ev.map((e) => {
    const et = terms(e.claim);
    const shared = t.filter((w) => et.includes(w));
    const num = shared.some((w) => /\d/.test(w));
    return { e, score: shared.length + (num ? 2 : 0) };
  }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score)[0];
  return best?.e ?? null;
}
interface EvidenceLine { claim: string; url: string }
interface TraceRow { sentence: string; verdict: Verdict; source_url?: string }

function trace(subject: string, body: string, evidence: EvidenceLine[]): {
  rows: TraceRow[]; ok: boolean; traced: number; unsupported: number; reason: string | null;
} {
  const lines: string[] = [];
  if (subject.trim()) lines.push(subject.trim());
  lines.push(...sentences(body));
  const rows: TraceRow[] = [];
  let tr = 0, bad = 0;
  for (const line of lines) {
    const hit = traceOne(line, evidence);
    if (hit) { rows.push({ sentence: line, verdict: 'traced', source_url: hit.url }); tr++; }
    else if (OURS.test(line)) rows.push({ sentence: line, verdict: 'about_us' });
    else if (!isClaim(line)) rows.push({ sentence: line, verdict: 'neutral' });
    else { rows.push({ sentence: line, verdict: 'unsupported' }); bad++; }
  }
  const nothingAboutThem = tr === 0 && bad === 0
    && rows.some((r) => r.verdict === 'about_us');
  const ok = bad === 0 && !nothingAboutThem;
  const reason = bad > 0
    ? `${bad} sentence${bad === 1 ? '' : 's'} the brief cannot support.`
    : nothingAboutThem
      ? 'Nothing here is about them — a template with a name on it will not go out.'
      : null;
  return { rows, ok, traced: tr, unsupported: bad, reason };
}

/* ── Types the drawer reads ──────────────────────────────────────────── */

interface JourneyRow {
  prospect_id: number; name: string; state: string; owed: string | null;
  offer?: string | null; brief_id?: number | null;
}
interface Brief {
  id: number; status: string; hook: string | null; recommended_offer: string | null;
  human_offer: string | null; raw_evidence: Array<{ claim: string; url: string; excerpt?: string }>;
  named_contacts: Array<{ name?: string | null; title?: string | null; email?: string | null; phone?: string | null }>;
  domain: string | null;
}
interface Contact {
  id: number; name: string; job_title: string | null; source: string;
  channels?: Array<{ channel_type: string; channel_value: string; source_url: string | null }>;
}

/* ── The drawer ──────────────────────────────────────────────────────── */

export function JourneyDrawer({
  journey, open, onClose, onMoved,
}: {
  journey: JourneyRow | null;
  open: boolean;
  onClose: () => void;
  onMoved: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // The channel this story is going out on. Populated from gt_channel_types
  // (migration 226). Default null — the reviewer must pick before saving so
  // "email" doesn't get silently assumed for a WhatsApp send.
  const [channelTypeId, setChannelTypeId] = useState<number | null>(null);
  // Manual-add form state. Kept in the drawer so opening/closing without
  // submitting does not silently drop what the reviewer typed.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  // Reset compose when the drawer switches to a different journey — a body
  // from one company must never leak into another. Channel resets too so
  // the reviewer doesn't inherit the last account's medium.
  useEffect(() => { setSubject(''); setBody(''); setChannelTypeId(null); }, [journey?.prospect_id]);

  // Master list of channel types (email, whatsapp, linkedin, blog, …).
  // Cached at hook level; one query per session.
  const { channelTypes } = useChannelTypes();
  const selectedChannel = channelTypes.find((c) => c.id === channelTypeId);

  const prospectId = journey?.prospect_id ?? 0;
  const enabled = open && !!journey;

  // Pull the pieces the drawer needs. `get_journey` gives state + ledger,
  // `get_briefs` gives the evidence + named_contacts for this account,
  // `get_contacts` gives the promoted people, `list_stories` gives R-S2's
  // "earlier stories" hint.
  const journeyRes = useSkillQuery<{ journey: Record<string, unknown>; events: Array<Record<string, unknown>>; moves: Array<{ to: string; owed: string; reason_required: boolean }> }>(
    'journey-skill', 'get_journey', { prospect_id: prospectId }, { enabled },
  );
  const briefsRes = useSkillQuery<{ briefs: Brief[] }>(
    'research-skill', 'get_briefs',
    { prospect_id: prospectId, limit: 1 }, { enabled },
  );
  const contactsRes = useSkillQuery<{ contacts: Contact[]; total: number }>(
    'contact-skill', 'get_prospect_contacts',
    { prospect_id: prospectId }, { enabled },
  );

  const brief = briefsRes.data?.data?.briefs?.[0];
  const journeyId = journeyRes.data?.data?.journey?.id as number | undefined;

  const briefContactsRes = useSkillQuery<{ entries: Array<{ named_index: number; name: string | null; title: string | null; email: string | null; phone: string | null; has_name: boolean; has_channel: boolean; addressable: boolean; promoted_contact_id: number | null; source_url: string | null }>; empty_reason: string | null }>(
    'contact-skill', 'list_brief_contacts',
    { brief_id: brief?.id ?? 0 }, { enabled: enabled && !!brief?.id },
  );
  const storiesRes = useSkillQuery<{ stories: Array<Record<string, unknown>> }>(
    'story-skill', 'list_stories',
    { journey_id: journeyId ?? 0 }, { enabled: enabled && !!journeyId },
  );

  // The recommender — the SHELL the human writes into. Only fires when
  // the drawer would actually show the compose surface (addressed/ready/
  // answered), so we don't burn a query on a brief nobody is about to
  // write against.
  const state = journey?.state ?? '';
  const recRes = useSkillQuery<{
    ready: boolean; reason?: string;
    headline?: string; headline_url?: string; angle?: string; ask?: string;
    suggested_subject?: string; story_seq?: number;
    cited_evidence?: Array<{ claim: string; url: string }>;
    already_said?: Array<{ seq: number; subject: string | null; snippet: string }>;
  }>(
    'story-skill', 'recommend_topic',
    { journey_id: journeyId ?? 0 },
    { enabled: enabled && !!journeyId && ['addressed', 'ready', 'answered'].includes(state) },
  );
  const rec = recRes.data?.data;

  const evidence: EvidenceLine[] = useMemo(() => (brief?.raw_evidence ?? [])
    .filter((e) => e?.claim && e?.url)
    .map((e) => ({ claim: e.claim, url: e.url })), [brief]);

  // Live trace of the current draft. Memoised so every keystroke is not a
  // full re-parse of the DOM tree above it.
  const traceOut = useMemo(
    () => trace(subject, body, evidence),
    [subject, body, evidence],
  );

  /* ── The mutations ───────────────────────────────────────────────── */

  const decide = useSkillMutation('research-skill', 'decide_brief', {
    onSuccess: () => { toast.showToast({ message: 'Brief decided — journey moved.', type: 'success' }); qc.invalidateQueries({ queryKey: ['skill'] }); onMoved(); },
    onError: (e) => toast.showToast({ message: e.message, type: 'error' }),
  });
  const promote = useSkillMutation('contact-skill', 'promote_from_brief', {
    onSuccess: () => { toast.showToast({ message: 'Contact promoted.', type: 'success' }); qc.invalidateQueries({ queryKey: ['skill'] }); },
    onError: (e) => toast.showToast({ message: e.message, type: 'error' }),
  });
  const addManual = useSkillMutation('contact-skill', 'add_contact_manually', {
    onSuccess: () => {
      toast.showToast({ message: 'Contact added — journey moved.', type: 'success' });
      qc.invalidateQueries({ queryKey: ['skill'] });
      setManualOpen(false);
      setManualName(''); setManualTitle(''); setManualEmail(''); setManualPhone('');
      onMoved();
    },
    onError: (e) => toast.showToast({ message: e.message, type: 'error' }),
  });
  const createStory = useSkillMutation('story-skill', 'create_story', {
    onSuccess: (r) => { toast.showToast({ message: `Draft saved (story ${r.data?.seq}).`, type: 'success' }); qc.invalidateQueries({ queryKey: ['skill'] }); setSubject(''); setBody(''); setChannelTypeId(null); },
    onError: (e) => toast.showToast({ message: e.message, type: 'error' }),
  });
  const approveStory = useSkillMutation('story-skill', 'approve_story', {
    onSuccess: () => { toast.showToast({ message: 'Story approved — journey is ready.', type: 'success' }); qc.invalidateQueries({ queryKey: ['skill'] }); onMoved(); },
    onError: (e) => toast.showToast({ message: e.message, type: 'error' }),
  });
  const logTouch = useSkillMutation('research-skill', 'log_touch', {
    onSuccess: () => { toast.showToast({ message: 'Touch logged — waiting for an answer.', type: 'success' }); qc.invalidateQueries({ queryKey: ['skill'] }); onMoved(); },
    onError: (e) => toast.showToast({ message: e.message, type: 'error' }),
  });

  if (!journey) return null;

  const briefContacts = briefContactsRes.data?.data?.entries ?? [];
  const promotedContact = contactsRes.data?.data?.contacts?.[0];
  const stories = storiesRes.data?.data?.stories ?? [];
  const approvedStories = stories.filter((x) => x.status === 'approved');
  const draftStories = stories.filter((x) => x.status === 'draft');

  return (
    <>
      <div className={`${s.scrim} ${open ? s.open : ''}`} onClick={onClose} />
      <aside className={`${s.drawer} ${open ? s.open : ''}`} role="dialog" aria-label="Journey detail">

        <header className={s.drawerHead}>
          <div>
            <div className={s.drawerTitle}>{journey.name}</div>
            <div className={s.drawerMeta}>
              {state.replace('_', ' ')}
              {journey.offer ? ` · ${journey.offer}` : ''}
            </div>
          </div>
          <button className={s.close} onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className={s.drawerBody}>
          {(journeyRes.isLoading || briefsRes.isLoading) && <VdfLoader message="Loading account" />}

          {/* WHAT IS OWED — the reason this drawer opened */}
          {journey.owed && !['ruled_out', 'parked', 'lost', 'won'].includes(state) && (
            <div className={s.owedBanner}>
              <div className={s.owedLabel}>Owed</div>
              <div className={s.owedText}>{journey.owed}</div>
            </div>
          )}

          {/* If a lookup fails, say so on screen rather than silently empty.
              Silent empties are how "the drawer just shows a name" happens. */}
          {journeyRes.error && (
            <div className={s.errorNote}>Journey lookup failed: {journeyRes.error.message}</div>
          )}
          {briefsRes.error && (
            <div className={s.errorNote}>Brief lookup failed: {briefsRes.error.message}</div>
          )}
          {!briefsRes.isLoading && !brief && !briefsRes.error && (
            <div className={s.errorNote}>
              No brief exists for this company yet. Research it first —
              nothing in this drawer works without evidence.
            </div>
          )}

          {/* Section 1 — The brief, always visible when it exists.
              The buttons only render at `researched` — the ruling belongs
              there — but the evidence is what every downstream section
              reads from and hiding it silently made the drawer feel dead. */}
          {brief && (
            <section className={s.section}>
              <div className={s.sectionH}>
                <span>{state === 'researched' ? 'Rule on the brief' : 'The brief'}</span>
                <span className={s.count}>{evidence.length} evidence line(s)</span>
              </div>
              <div className={s.sectionB}>
                {brief.hook && <p style={{ marginBottom: '0.75rem' }}>{brief.hook}</p>}
                {evidence.map((e, i) => (
                  <div key={i} className={s.item}>
                    <div className={s.itemHead}><span className={s.itemTitle}>{e.claim}</span></div>
                    <span className={s.evUrl}>{e.url}</span>
                  </div>
                ))}
                {state === 'researched' && (
                  <div className={s.actions}>
                    <button className={`${s.btn} ${s.btnPrimary}`}
                      disabled={decide.isPending}
                      onClick={() => decide.mutateAsync({ brief_id: brief.id, decision: 'approved' })}>
                      Approve this offer
                    </button>
                    <button className={s.btn} disabled={decide.isPending}
                      onClick={() => {
                        const note = window.prompt('Why not?', '');
                        if (!note || note.length < 3) return;
                        decide.mutateAsync({ brief_id: brief.id, decision: 'no_contact', note });
                      }}>
                      Rule out
                    </button>
                  </div>
                )}
                {state !== 'researched' && (brief.human_offer || brief.recommended_offer) && (
                  <p className={s.hint}>
                    Ruled on this brief already · offer:{' '}
                    <strong>{brief.human_offer ?? brief.recommended_offer}</strong>
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Section 2 — The person */}
          {brief && ['qualified', 'addressed', 'ready', 'waiting', 'answered'].includes(state) && (
            <section className={s.section}>
              <div className={s.sectionH}>
                <span>The person</span>
                <span className={s.count}>
                  {promotedContact ? 'confirmed' : briefContacts.length ? `${briefContacts.length} candidate(s)` : ''}
                </span>
              </div>
              <div className={s.sectionB}>
                {promotedContact ? (
                  <div className={s.item}>
                    <div className={s.itemHead}>
                      <span className={s.itemTitle}>{promotedContact.name}</span>
                      {promotedContact.job_title && (
                        <span className={s.itemMeta}>{promotedContact.job_title}</span>
                      )}
                    </div>
                    <div className={s.itemBody}>
                      source: {promotedContact.source}
                      {(promotedContact.channels ?? []).map((c, i) => (
                        <span key={i}> · {c.channel_type}: {c.channel_value}</span>
                      ))}
                    </div>
                  </div>
                ) : (briefContactsRes.data?.data?.empty_reason || briefContacts.length === 0) ? (
                  <>
                    <p className={s.mut}>
                      {briefContactsRes.data?.data?.empty_reason
                        ?? 'No named contacts on the brief — the research flow found none.'}
                    </p>
                    {!manualOpen && (
                      <div className={s.actions}>
                        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setManualOpen(true)}>
                          Add a contact by hand
                        </button>
                      </div>
                    )}
                    {manualOpen && (
                      <>
                        <div className={s.field}>
                          <label className={s.label}>Name</label>
                          <input className={s.input} value={manualName}
                            onChange={(e) => setManualName(e.target.value)}
                            placeholder="Full name" />
                        </div>
                        <div className={s.field}>
                          <label className={s.label}>Role (optional)</label>
                          <input className={s.input} value={manualTitle}
                            onChange={(e) => setManualTitle(e.target.value)}
                            placeholder="e.g. Plant Head" />
                        </div>
                        <div className={s.field}>
                          <label className={s.label}>Email or phone (at least one)</label>
                          <input className={s.input} value={manualEmail}
                            onChange={(e) => setManualEmail(e.target.value)}
                            placeholder="email@company.com" style={{ marginBottom: '0.5rem' }} />
                          <input className={s.input} value={manualPhone}
                            onChange={(e) => setManualPhone(e.target.value)}
                            placeholder="+91 …" />
                        </div>
                        <p className={s.hint}>
                          This person will be recorded with <strong>source: manual</strong> —
                          honestly not from the brief. R-C2 still applies: at least one channel
                          or the journey cannot advance.
                        </p>
                        <div className={s.actions}>
                          <button className={`${s.btn} ${s.btnPrimary}`}
                            disabled={addManual.isPending || !manualName.trim()
                              || (!manualEmail.trim() && !manualPhone.trim())}
                            onClick={() => addManual.mutateAsync({
                              prospect_id: journey.prospect_id,
                              name: manualName.trim(),
                              job_title: manualTitle.trim() || null,
                              email: manualEmail.trim() || null,
                              phone: manualPhone.trim() || null,
                              confirm_addressed: true,
                            })}>
                            Add & confirm addressed
                          </button>
                          <button className={s.btn} onClick={() => setManualOpen(false)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  briefContacts.filter((c) => !c.promoted_contact_id).map((c) => (
                    <div key={c.named_index} className={s.item}>
                      <div className={s.itemHead}>
                        <span className={s.itemTitle}>{c.name || '(no name)'}</span>
                        {c.title && <span className={s.itemMeta}>{c.title}</span>}
                      </div>
                      <div className={s.itemBody}>
                        {c.email && <>{c.email} </>}
                        {c.phone && <>· {c.phone}</>}
                        {!c.has_channel && <span className={s.mut}> · no channel — cannot address</span>}
                      </div>
                      <div className={s.actions}>
                        <button className={`${s.btn} ${s.btnPrimary}`}
                          disabled={!c.addressable || promote.isPending}
                          onClick={() => promote.mutateAsync({
                            brief_id: brief.id,
                            named_index: c.named_index,
                            confirm_addressed: true,
                          })}>
                          Confirm — this is the person
                        </button>
                        <button className={s.btn} disabled={promote.isPending}
                          onClick={() => promote.mutateAsync({
                            brief_id: brief.id, named_index: c.named_index,
                          })}>
                          Promote as draft
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* Section 3 — Stories (earlier ones for R-S2 visibility) */}
          {stories.length > 0 && (
            <section className={s.section}>
              <div className={s.sectionH}>
                <span>Stories on this journey</span>
                <span className={s.count}>{stories.length}</span>
              </div>
              <div className={s.sectionB}>
                {stories.map((st, i) => (
                  <div key={i} className={s.item}>
                    <div className={s.itemHead}>
                      <span className={s.itemTitle}>
                        Story {String(st.seq)} · {String(st.status)}
                        {st.subject ? ` — ${String(st.subject)}` : ''}
                      </span>
                      <span className={s.itemMeta}>{String(st.kind_key)}</span>
                    </div>
                    <div className={s.itemBody}>{String(st.body ?? '').slice(0, 220)}
                      {String(st.body ?? '').length > 220 ? '…' : ''}</div>
                    {st.status === 'draft' && (
                      <div className={s.actions}>
                        <button className={`${s.btn} ${s.btnPrimary}`}
                          disabled={approveStory.isPending}
                          onClick={() => approveStory.mutateAsync({ story_id: st.id })}>
                          Approve this draft
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Section 4 — Compose (available at addressed, ready, answered) */}
          {brief && ['addressed', 'ready', 'answered'].includes(state) && (
            <section className={s.section}>
              <div className={s.sectionH}>
                <span>Write a story</span>
                <span className={s.count}>
                  VaNi recommends · you write · R-S1 checks
                </span>
              </div>
              <div className={s.sectionB}>

                {/* ── The recommender — the SHELL the human writes into ────
                    "AI recommends topic and context, human writes the words."
                    Deterministic at pilot scale; the same response shape a
                    future LLM will fill. What the reviewer sees is: what to
                    open on (with the source URL to click), the offer angle,
                    the ask, and what NOT to repeat from earlier stories. */}
                {rec?.ready && (
                  <div className={s.owedBanner} style={{ marginBottom: '1rem' }}>
                    <div className={s.owedLabel}>
                      VaNi recommends · story {rec.story_seq}
                    </div>
                    <div style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                      Open on: <strong>{rec.headline}</strong>
                    </div>
                    {rec.headline_url && (
                      <div className={s.itemMeta} style={{ marginBottom: '0.6rem' }}>
                        <a href={`https://${rec.headline_url.replace(/^https?:\/\//, '')}`}
                          target="_blank" rel="noreferrer"
                          style={{ color: 'var(--color-accent)' }}>
                          → {rec.headline_url}
                        </a>
                      </div>
                    )}
                    <div className={s.hint} style={{ marginTop: '0.5rem' }}>
                      <strong>Angle:</strong> {rec.angle}
                    </div>
                    <div className={s.hint}>
                      <strong>Ask:</strong> {rec.ask}
                    </div>
                    {rec.already_said && rec.already_said.length > 0 && (
                      <div className={s.hint} style={{ marginTop: '0.5rem', color: 'var(--color-warning)' }}>
                        <strong>Do not repeat:</strong> story{rec.already_said.length > 1 ? 'ies' : ''}{' '}
                        {rec.already_said.map((x) => x.seq).join(', ')}
                        {' '}already said this.
                      </div>
                    )}
                    {rec.suggested_subject && (
                      <div className={s.actions} style={{ marginTop: '0.75rem' }}>
                        <button className={`${s.btn} ${s.btnPrimary}`}
                          onClick={() => setSubject(rec.suggested_subject ?? '')}>
                          Use this subject
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {rec && !rec.ready && (
                  <div className={s.errorNote}>{rec.reason}</div>
                )}

                <div className={s.field}>
                  <label className={s.label}>Evidence to cite</label>
                  <div className={s.evPicker}>
                    {evidence.map((e, i) => (
                      <button key={i} className={s.evLine}
                        onClick={() => setBody((b) => (b ? b + '\n\n' : '') + e.claim + '. ')}>
                        <span>{e.claim}</span>
                        <span className={s.use}>cite</span>
                      </button>
                    ))}
                    {evidence.length === 0 && (
                      <p className={s.mut} style={{ fontSize: '0.8rem' }}>
                        No evidence lines yet. Research this company first.
                      </p>
                    )}
                  </div>
                </div>
                {/* Channel picker — master data from gt_channel_types (mig 226).
                    Grouped by kind so the reviewer sees direct/broadcast/asset
                    as distinct affordances rather than one long list. */}
                <div className={s.field}>
                  <label className={s.label}>Channel</label>
                  <select className={s.input}
                    value={channelTypeId ?? ''}
                    onChange={(e) => setChannelTypeId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Pick a channel…</option>
                    {(['direct', 'broadcast', 'asset'] as const).map((k) => {
                      const inKind = channelTypes.filter((c) => c.kind === k);
                      if (inKind.length === 0) return null;
                      const groupLabel = k === 'direct' ? '1:1 send'
                        : k === 'broadcast' ? 'Public post' : 'Attached asset';
                      return (
                        <optgroup key={k} label={groupLabel}>
                          {inKind.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  {selectedChannel && selectedChannel.kind !== 'direct' && (
                    <p className={s.hint} style={{ marginTop: '0.35rem' }}>
                      {selectedChannel.kind === 'broadcast'
                        ? 'A public post — the body below is the copy going out; subject may be a headline.'
                        : 'An attached asset — pair with a direct-channel story that references it.'}
                    </p>
                  )}
                </div>
                <div className={s.field}>
                  <label className={s.label}>Subject</label>
                  <input className={s.input} value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="A short subject line…" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Body</label>
                  <textarea className={s.textarea} value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Open on evidence. Say something a template could not." />
                </div>

                {(subject || body) && (
                  <div className={s.trace}>
                    <div className={s.traceHead}>
                      <span>Claim trace</span>
                      <span>{traceOut.traced} traced · {traceOut.unsupported} unsupported</span>
                    </div>
                    {traceOut.rows.map((r, i) => (
                      <div key={i} className={`${s.sent} ${r.verdict === 'traced' ? s.ok
                        : r.verdict === 'unsupported' ? s.no : s.own}`}>
                        {r.sentence}
                        <span className={s.sentTag}>{r.source_url ?? r.verdict.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(subject || body) && (
                  <div className={`${s.verdict} ${traceOut.ok ? s.good : s.bad}`}>
                    {traceOut.ok
                      ? `${traceOut.traced} claim(s) trace to their own site — this says something a template could not.`
                      : traceOut.reason}
                  </div>
                )}

                <div className={s.actions}>
                  <button className={`${s.btn} ${s.btnPrimary}`}
                    disabled={createStory.isPending || !body || body.length < 20
                      || !journeyId || !traceOut.ok || !channelTypeId}
                    onClick={() => journeyId && channelTypeId && createStory.mutateAsync({
                      journey_id: journeyId,
                      channel_type_id: channelTypeId,
                      subject: subject || null, body,
                    })}>
                    Save draft
                  </button>
                  {!channelTypeId && (body.length >= 20) && (
                    <span className={s.hint}>Pick a channel above — a story with no medium is unsent by definition.</span>
                  )}
                  {draftStories.length === 0 && (
                    <span className={s.hint}>
                      A saved draft is not sent. Approve it below and the journey moves to ready.
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Section 5 — Send (available at ready) */}
          {state === 'ready' && promotedContact && approvedStories.length > 0 && (
            <section className={s.section}>
              <div className={s.sectionH}>
                <span>Log the send</span>
                <span className={s.count}>
                  {approvedStories.length} approved
                </span>
              </div>
              <div className={s.sectionB}>
                <p className={s.mut} style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                  Log a send once it has actually gone out. This flips the story to sent, moves
                  the journey to waiting, and starts the response window.
                </p>
                {approvedStories.map((st, i) => (
                  <div key={i} className={s.actions} style={{ borderTop: 'none', paddingTop: 0 }}>
                    <button className={`${s.btn} ${s.btnPrimary}`}
                      disabled={logTouch.isPending}
                      onClick={() => logTouch.mutateAsync({
                        prospect_id: journey.prospect_id,
                        contact_id: promotedContact.id,
                        story_id: st.id,
                        channel: 'email',
                      })}>
                      Sent story {String(st.seq)} by email
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Section 6 — The ledger */}
          <section className={s.section}>
            <div className={s.sectionH}>
              <span>The ledger</span>
              <span className={s.count}>{journeyRes.data?.data?.events?.length ?? 0}</span>
            </div>
            <div className={s.sectionB}>
              {(journeyRes.data?.data?.events ?? []).map((ev, i) => (
                <div key={i} className={s.item}>
                  <div className={s.itemHead}>
                    <span className={s.itemTitle}>
                      {ev.from_state ? `${String(ev.from_state).replace('_', ' ')} → ` : ''}
                      {String(ev.to_state).replace('_', ' ')}
                    </span>
                    <span className={s.itemMeta}>
                      {String(ev.actor)} · {new Date(String(ev.created_at)).toLocaleDateString()}
                    </span>
                  </div>
                  {ev.reason ? <div className={s.itemBody}>{String(ev.reason)}</div> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
