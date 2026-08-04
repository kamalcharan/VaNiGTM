'use client';

/**
 * VaNi AI console — partner links, /console/partners
 *
 * Owner-only. Each referral partner's link per assessment, with their lead
 * count. The link is what a partner actually uses: /a/<slug>?ref=<code>,
 * which saveAnswer resolves to their gt_partner row so their referrals are
 * attributed and scoped to them.
 *
 * Slugs come from the API, not from this file — a second assessment is a
 * config row, and its partner links should appear here with no code
 * change. Adding or deactivating partners is still done in SQL (see
 * SKILL.md); this screen is read-only on purpose rather than half-built.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { ConsoleNav, relativeAge } from '../console-shared';
import s from '../console.module.css';
import v from '../../../(vani)/vani-tokens.module.css';

interface Partner {
  id: string;
  ref_code: string | null;
  display_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  lead_count: number;
  last_lead_at: string | null;
}

interface Assessment { service_slug: string; short_title: string | null }
interface Envelope<T> { success: boolean; data: T; error?: string }

export default function PartnersPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<Envelope<{ partners: Partner[]; assessments: Assessment[] }>>(
        API.skills.execute,
        { pathParams: { skill: 'assessment-skill', fn: 'get_partners' }, body: { params: {} } },
      );
      if (!res.success) {
        // The backend refuses a partner outright; say so plainly rather
        // than showing an empty screen that looks like "no partners yet".
        if (String(res.error).startsWith('OWNER_ONLY')) { setOwnerOnly(true); return; }
        setError(res.error || 'Could not load partners.');
        return;
      }
      setPartners(res.data.partners ?? []);
      setAssessments(res.data.assessments ?? []);
      setError(null);
    } catch (err) {
      setError((err as ApiError)?.message || 'Could not load partners.');
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);

  function copy(url: string, key: string) {
    navigator.clipboard?.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (authLoading || !isAuthenticated) return <div className={v.vaniTokens} />;

  if (ownerOnly) {
    return (
      <div className={v.vaniTokens}>
        <ConsoleNav active="partners" isOwner={false} />
        <div className={s.empty}>Partner links are visible to the owner only.</div>
      </div>
    );
  }

  return (
    <div className={v.vaniTokens}>
      <ConsoleNav active="partners" isOwner />

      {error && <div className={s.errBanner} role="alert"><span aria-hidden>⚠</span><span>{error}</span></div>}

      {partners === null && !error && <div className={s.empty}>Loading…</div>}

      {partners !== null && partners.length === 0 && (
        <div className={s.empty}>
          No referral partners yet. Leads taken without a <code>?ref=</code> link show as Direct.
        </div>
      )}

      {(partners ?? []).map((p) => (
        <div key={p.id} className={s.plCard}>
          <h3>{p.display_name}{!p.is_active && <span style={{ color: 'var(--ink-3)' }}> · inactive</span>}</h3>
          <div className={s.sub}>
            {p.ref_code} · {p.email} · {p.lead_count} lead{p.lead_count === 1 ? '' : 's'}
            {p.last_lead_at ? ` · last ${relativeAge(p.last_lead_at)} ago` : ''}
          </div>

          {assessments.map((a) => {
            // Built against the current origin so the link is correct in
            // dev and in production without a configured base URL.
            const url = typeof window !== 'undefined'
              ? `${window.location.origin}/a/${a.service_slug}?ref=${encodeURIComponent(p.ref_code ?? '')}`
              : '';
            const key = `${p.id}:${a.service_slug}`;
            return (
              <div key={a.service_slug} className={s.linkRow}>
                <span>{a.short_title ?? a.service_slug}</span>
                <code>{url}</code>
                <button className={`${s.btn} ${s.btnGhost} ${s.btnSmall} ${s.cp}`} onClick={() => copy(url, key)}>
                  {copied === key ? 'Copied' : 'Copy'}
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {partners !== null && (
        <p className={s.note}>
          Adding or deactivating a partner is done directly in the database for now — see
          assessment-skill&rsquo;s SKILL.md. Partners see only the leads that came through their
          own link.
        </p>
      )}
    </div>
  );
}
