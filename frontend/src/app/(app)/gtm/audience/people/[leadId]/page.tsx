'use client';

/**
 * VaNi AI console — lead detail, /console/:leadId
 *
 * The assessment lens on one respondent: what they answered, how it scored,
 * where the follow-up stands. The person themselves also exists as a
 * gt_contacts row (assessment-skill bridges every captured lead), so this
 * screen links across rather than duplicating channels or outreach.
 *
 * Renders entirely from get_lead's response — question text, option labels,
 * mode names and percentages, band and narrative all arrive from the API.
 * No assessment copy, no thresholds, no scoring here.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { BandChip, StatusChip, ConsoleNav, absoluteStamp, STATUS_LABEL } from '../console-shared';
import s from '../console.module.css';
import v from '../../../../../(vani)/vani-tokens.module.css';

interface Lead {
  id: string;
  lead_no: string | null;
  name: string; email: string; company: string; role_title: string;
  phone: string | null;
  status: string;
  created_at: string;
  partner_name: string | null;
  contact_id: number | null;
  response_id: string | null;
  health_score: number | null;
  band: string | null;
  top_modes: Array<{ key: string; name: string; exposure_pct: number }> | null;
  all_modes: Array<{ key: string; name: string; exposure_pct: number }> | null;
  report_url: string | null;
  report_ref: string | null;
  narrative: string | null;
  emailed_at: string | null;
  completed_at: string | null;
}

interface AnsweredQuestion {
  question_id: string; question_text: string;
  option_letter: string; option_label: string; context_only: boolean;
}

interface TimelineEvent {
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface Envelope<T> { success: boolean; data: T; error?: string }

const EVENT_LABEL: Record<string, string> = {
  response_started: 'Assessment started',
  response_completed: 'Assessment completed',
  lead_captured: 'Lead captured',
  report_ready: 'Report generated',
  contact_bridged: 'Linked to Contacts',
  contact_bridge_failed: 'Contacts link FAILED',
  status_changed: 'Status changed',
  note: 'Note',
};

const STATUSES = ['new', 'contacted', 'l2_booked', 'engaged', 'closed_won', 'closed_lost'];

export default function LeadDetailPage() {
  const params = useParams<{ leadId: string }>();
  const router = useRouter();
  const leadId = params?.leadId;
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [responses, setResponses] = useState<AnsweredQuestion[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [savingStatus, setSavingStatus] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    try {
      const res = await apiFetch<Envelope<{ lead: Lead; responses: AnsweredQuestion[]; timeline: TimelineEvent[] }>>(
        API.skills.execute,
        { pathParams: { skill: 'assessment-skill', fn: 'get_lead' }, body: { params: { lead_id: leadId } } },
      );
      if (!res.success) { setError(res.error || 'Could not load this lead.'); return; }
      setLead(res.data.lead);
      setResponses(res.data.responses ?? []);
      setTimeline(res.data.timeline ?? []);
      setIsOwner(res.data.lead.partner_name !== null);
      setError(null);
    } catch (err) {
      setError((err as ApiError)?.message || 'Could not load this lead.');
    }
  }, [leadId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);

  async function changeStatus(status: string) {
    if (!leadId) return;
    setSavingStatus(true);
    try {
      const res = await apiFetch<Envelope<unknown>>(API.skills.execute, {
        pathParams: { skill: 'assessment-skill', fn: 'update_lead_status' },
        body: { params: { lead_id: leadId, status } },
      });
      if (!res.success) setError(res.error || 'Status could not be changed.');
      else await load();
    } catch (err) {
      setError((err as ApiError)?.message || 'Status could not be changed.');
    } finally { setSavingStatus(false); }
  }

  async function addNote() {
    if (!leadId || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await apiFetch<Envelope<unknown>>(API.skills.execute, {
        pathParams: { skill: 'assessment-skill', fn: 'add_lead_note' },
        body: { params: { lead_id: leadId, text: noteText.trim() } },
      });
      if (!res.success) { setError(res.error || 'Note could not be saved.'); return; }
      setNoteText('');
      await load();
    } catch (err) {
      setError((err as ApiError)?.message || 'Note could not be saved.');
    } finally { setSavingNote(false); }
  }

  if (authLoading || !isAuthenticated) return <div className={v.vaniTokens} />;

  if (error && !lead) {
    return (
      <div className={v.vaniTokens}>
        <ConsoleNav active="leads" isOwner={isOwner} />
        <div className={s.errBanner} role="alert"><span aria-hidden>⚠</span><span>{error}</span></div>
        <button className={`${s.btn} ${s.btnGhost} ${s.btnSmall}`} onClick={() => router.push('/gtm/audience/people')}>
          ← Back to leads
        </button>
      </div>
    );
  }

  if (!lead) return <div className={v.vaniTokens}><div className={s.empty}>Loading…</div></div>;

  const topKeys = new Set((lead.top_modes ?? []).map((m) => m.key));
  const profile = lead.all_modes ?? lead.top_modes ?? [];

  return (
    <div className={v.vaniTokens}>
      <ConsoleNav active="leads" isOwner={isOwner} />

      {error && <div className={s.errBanner} role="alert"><span aria-hidden>⚠</span><span>{error}</span></div>}

      <div className={s.leadHead}>
        <div>
          <h2>{lead.name}</h2>
          <div className={s.sub}>
            {lead.company} · {lead.role_title} · {lead.email}
            {lead.phone ? ` · ${lead.phone}` : ''}
            {lead.lead_no ? ` · ${lead.lead_no}` : ''}
            {lead.report_ref ? ` · Ref ${lead.report_ref}` : ''}
            {' · Source: '}{lead.partner_name ?? 'Direct'}
          </div>
        </div>
        <div className={s.actRow}>
          <button className={`${s.btn} ${s.btnGhost} ${s.btnSmall}`} onClick={() => router.push('/gtm/audience/people')}>
            ← Leads
          </button>
          {lead.report_url && (
            <>
              <a className={`${s.btn} ${s.btnSmall}`} href={lead.report_url} target="_blank" rel="noopener noreferrer">
                Open report
              </a>
              <button
                className={`${s.btn} ${s.btnGhost} ${s.btnSmall}`}
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}${lead.report_url}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copied' : 'Copy report link'}
              </button>
            </>
          )}
          {lead.contact_id && (
            <button className={`${s.btn} ${s.btnGhost} ${s.btnSmall}`} onClick={() => router.push('/gtm/people')}>
              View in Contacts
            </button>
          )}
        </div>
      </div>

      <div className={s.leadGrid}>
        <div>
          {/* ── Assessment result ── */}
          <div className={s.pBlock}>
            <h4>Assessment result</h4>
            {lead.health_score === null ? (
              <div className={s.empty} style={{ padding: '8px 0', textAlign: 'left' }}>
                This lead has no completed assessment.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontSize: 38, fontWeight: 700 }}>
                    {lead.health_score}
                  </span>
                  <BandChip band={lead.band} />
                  {lead.completed_at && (
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      Completed {absoluteStamp(lead.completed_at)}
                    </span>
                  )}
                </div>
                {profile.map((m) => (
                  <div key={m.key} className={`${s.miniBar} ${topKeys.has(m.key) ? s.miniBarHi : ''}`}>
                    <span>{m.key} · {m.name}</span>
                    <div className={s.trk}><div className={s.fil} style={{ width: `${Math.max(m.exposure_pct, 1)}%` }} /></div>
                    <span>{m.exposure_pct}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* ── VaNi's summary ── */}
          {lead.narrative && (
            <div className={s.pBlock}>
              <h4>VaNi’s summary</h4>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)', margin: 0 }}>{lead.narrative}</p>
            </div>
          )}

          {/* ── Responses ── */}
          <div className={s.pBlock}>
            <h4>Responses ({responses.length})</h4>
            {responses.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No answers recorded.</div>}
            {responses.map((r) => (
              <div key={r.question_id} className={s.ans}>
                <div className={s.q}>
                  {r.question_id} · {r.question_text}
                  {r.context_only && <span style={{ color: 'var(--ink-3)' }}> (context only)</span>}
                </div>
                {r.option_letter} — {r.option_label}
              </div>
            ))}
          </div>
        </div>

        <div>
          {/* ── Pipeline ── */}
          <div className={s.pBlock}>
            <h4>Pipeline</h4>
            <div style={{ marginBottom: 14 }}><StatusChip status={lead.status} /></div>
            <div className={s.field}>
              <label htmlFor="lead-status">STATUS</label>
              <select id="lead-status" value={lead.status} disabled={savingStatus}
                onChange={(e) => void changeStatus(e.target.value)}>
                {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label htmlFor="lead-note">ADD NOTE</label>
              <input id="lead-note" value={noteText} placeholder="e.g. Called — asked for the one-pager"
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addNote(); }} />
            </div>
            <button className={`${s.btn} ${s.btnGhost} ${s.btnSmall} ${s.btnFull}`}
              disabled={savingNote || !noteText.trim()} onClick={() => void addNote()}>
              {savingNote ? 'Saving…' : 'Save note'}
            </button>
          </div>

          {/* ── Timeline ── */}
          <div className={s.pBlock}>
            <h4>Timeline</h4>
            <ul className={s.tl}>
              {timeline.map((e, i) => (
                <li key={i}>
                  <span className={s.t}>{absoluteStamp(e.created_at)}</span>
                  <span>
                    {EVENT_LABEL[e.event_type] ?? e.event_type}
                    {e.event_type === 'note' && e.payload?.text ? ` — ${String(e.payload.text)}` : ''}
                    {e.event_type === 'status_changed' && e.payload?.status
                      ? ` — ${STATUS_LABEL[String(e.payload.status)] ?? String(e.payload.status)}` : ''}
                  </span>
                </li>
              ))}
              {timeline.length === 0 && <li><span>No events yet.</span></li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
