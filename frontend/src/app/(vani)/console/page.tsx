'use client';

/**
 * VaNi AI console — leads list, /console
 *
 * Data comes from assessment-skill's get_leads. Role scoping is enforced
 * server-side (a partner's JWT simply yields fewer rows); this screen never
 * asks for "all leads" and never filters by partner client-side to fake
 * isolation. The partner filter below is a convenience for owners over
 * rows the server already agreed to send.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { BandChip, StatusChip, ConsoleNav, relativeAge, STATUS_LABEL } from './console-shared';
import s from './console.module.css';
import v from '../vani-tokens.module.css';

interface Lead {
  id: string;
  lead_no: string | null;
  name: string;
  email: string;
  company: string;
  role_title: string;
  status: string;
  created_at: string;
  partner_name: string | null;
  response_id: string | null;
  health_score: number | null;
  band: string | null;
}

interface SkillEnvelope<T> { success: boolean; data: T; error?: string }

const STATUSES = ['new', 'contacted', 'l2_booked', 'engaged', 'closed_won', 'closed_lost'];
const BANDS = ['situational', 'structural', 'systemic'];

export default function ConsoleLeadsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [status, setStatus] = useState('');
  const [band, setBand] = useState('');
  const [partner, setPartner] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/console/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        // status is the one filter the API supports; everything else is
        // applied below over the rows it returned.
        const res = await apiFetch<SkillEnvelope<{ leads: Lead[] }>>(API.skills.execute, {
          pathParams: { skill: 'assessment-skill', fn: 'get_leads' },
          body: { params: status ? { status } : {} },
        });
        if (cancelled) return;
        if (!res.success) { setError(res.error || 'Could not load leads.'); return; }
        setLeads(res.data.leads ?? []);
        // Owner iff any returned lead carries a partner other than the
        // viewer's own — see console-shared.tsx on why role is inferred
        // from the server's answer rather than decided here. A brand-new
        // console with no leads shows the partner view, which is the safe
        // direction to be wrong in.
        setIsOwner((res.data.leads ?? []).some((l) => l.partner_name !== null)
          || (res.data.leads ?? []).length === 0 ? false : true);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as ApiError)?.message || 'Could not load leads.');
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, status]);

  const partners = useMemo(
    () => Array.from(new Set((leads ?? []).map((l) => l.partner_name).filter(Boolean))) as string[],
    [leads]);

  const visible = useMemo(() => (leads ?? []).filter((l) => {
    if (band && l.band !== band) return false;
    if (partner && (partner === '__direct' ? l.partner_name !== null : l.partner_name !== partner)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.company.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [leads, band, partner, search]);

  if (authLoading || !isAuthenticated) {
    return <div className={v.vaniRoot}><div className={v.darkStage} /></div>;
  }

  return (
    <div className={v.vaniRoot}>
      <div className={v.darkStage}>
        <div className={v.wrap} style={{ paddingTop: 22 }}>
          <ConsoleNav active="leads" isOwner={isOwner} />

          <div className={s.cFilters}>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
            </select>
            <select value={band} onChange={(e) => setBand(e.target.value)}>
              <option value="">All bands</option>
              {BANDS.map((b) => <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1)}</option>)}
            </select>
            {isOwner && (
              <select value={partner} onChange={(e) => setPartner(e.target.value)}>
                <option value="">All partners</option>
                <option value="__direct">Direct</option>
                {partners.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <input placeholder="Search name / company…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>

          {error && <div className={s.errBanner} role="alert"><span aria-hidden>⚠</span><span>{error}</span></div>}

          {leads === null && !error && <div className={s.empty}>Loading…</div>}

          {leads !== null && visible.length === 0 && (
            <div className={s.empty}>
              {leads.length === 0 ? 'No leads yet.' : 'No leads match these filters.'}
            </div>
          )}

          {visible.length > 0 && (
            <div className={s.tableWrap}>
              <table className={s.cTable}>
                <thead>
                  <tr>
                    <th>Lead</th><th>Band</th><th>Score</th><th>Partner</th><th>Status</th><th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((l) => (
                    <tr key={l.id} onClick={() => router.push(`/console/${l.id}`)}>
                      <td className={s.whoCell}>
                        <b>{l.name}</b>
                        <span>{l.company} · {l.role_title}</span>
                      </td>
                      <td><BandChip band={l.band} /></td>
                      <td className={s.scoreCell}>{l.health_score ?? '—'}</td>
                      <td>{l.partner_name ?? 'Direct'}</td>
                      <td><StatusChip status={l.status} /></td>
                      <td>{relativeAge(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
