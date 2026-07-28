'use client';

/**
 * Companies — the records an import lands in gt_prospects.
 *
 * Answers the three questions a user asks after importing 2,913 rows:
 * where are they, is the data any good, and which of them are duplicates —
 * plus tagging, which at import time attaches to the delivery and here
 * attaches to the record.
 *
 * Quality is shown as TWO numbers. Completeness is fill rate; validity is
 * whether what was filled survived checking. Blending them would hide the
 * exact failure this was designed around: a file that reads 100% populated on
 * revenue while most of those values are the literal string 'undefined+'.
 */

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';
import { formatDate } from '@/lib/format';
import {
  VdfPageHeader, VdfLoader, VdfStatCard, VdfBadge, VdfEmptyState,
  VdfSearchBar, VdfButton, VdfModal, VdfCheckbox,
} from '@/components/vdf';
import s from './companies.module.css';

interface Tag { id: number; label: string; inherited: boolean }

interface Prospect {
  id: number;
  ref: string | null;
  name: string;
  relationship: string;
  domain_normalized: string | null;
  city: string | null;
  state_code: string | null;
  industry_raw: string | null;
  employees_band: string | null;
  completeness: string | null;
  validity: string | null;
  source_as_of: string | null;
  freshness: 'current' | 'recent' | 'ageing' | 'stale' | 'unknown';
  shares_domain?: boolean;
  shares_name?: boolean;
  source_record_id?: string;
  load_label: string | null;
  tags: Tag[];
  /* Pool rows only */
  shares_block?: boolean;
  resolved?: boolean;
  source_code?: string | null;
}

/** Tenant stats and pool stats share the quality fields and differ elsewhere. */
interface Stats {
  total: number;
  avg_completeness: string | null; avg_validity: string | null;
  with_rejected_fields: number; with_domain: number; undated: number;
  /* tenant */
  customers?: number; prospects?: number; fresh?: number; stale?: number;
  sharing_domain?: number; sharing_name?: number;
  /* pool */
  loads?: number; resolved?: number; sharing_block?: number;
}

const FRESHNESS: Record<string, { label: string; variant: 'success' | 'info' | 'default' | 'gold' }> = {
  current: { label: 'Current',  variant: 'success' },
  recent:  { label: 'Recent',   variant: 'info'    },
  ageing:  { label: 'Ageing',   variant: 'gold'    },
  stale:   { label: 'Stale',    variant: 'default' },
  unknown: { label: 'Undated',  variant: 'default' },
};

const pct = (v: string | null): string =>
  v === null ? '—' : `${Math.round(Number(v) * 100)}%`;

export default function CompaniesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const [scope, setScope] = useState<'mine' | 'pool'>('mine');
  const [search, setSearch] = useState('');
  const [relationship, setRelationship] = useState<string>('');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [tagId, setTagId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [tagModal, setTagModal] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [detail, setDetail] = useState<Prospect | null>(null);

  // `relationship` is a tenant-side idea — a pool row is nobody's customer —
  // so it is not sent when the pool is in scope.
  const params = useMemo(() => ({
    search: search.trim() || undefined,
    ...(scope === 'pool' ? {} : { relationship: relationship || undefined }),
    only_duplicates: onlyDuplicates || undefined,
    tag_id: tagId ?? undefined,
    limit: 100,
  }), [scope, search, relationship, onlyDuplicates, tagId]);

  // Two scopes, one screen. "Mine" is gt_prospects, tenant-scoped. "Pool" is
  // gt_universe_company_sources — cross-tenant infrastructure, admin only,
  // and gated again in the skill against vn_tenants.is_admin.
  const isPool = scope === 'pool';

  const { data, isLoading, isError, error } = useSkillQuery<{
    prospects?: Prospect[]; companies?: Prospect[]; total: number; stats?: Stats;
  }>(
    'prospect-skill',
    isPool ? 'get_universe_companies' : 'get_prospects',
    params,
    { enabled: !isPool || isAdmin },
  );

  const { data: statsData } =
    useSkillQuery<{ stats: Stats }>('prospect-skill', 'get_prospect_stats', {}, { enabled: !isPool });

  const { mutate: applyTag, isPending: tagging } = useSkillMutation(
    'prospect-skill', 'tag_prospects',
    {
      onSuccess: (res: any) => {
        showToast({ message: `Tagged ${res?.data?.applied ?? 0} companies`, type: 'success' });
        setSelected([]); setTagModal(false);
        queryClient.invalidateQueries({ queryKey: ['skill', 'prospect-skill', 'get_prospects'] });
      },
      onError: (err: any) => showToast({ message: err?.message || 'Could not tag', type: 'error' }),
    },
  );

  async function openTagModal() {
    setTagModal(true);
    try {
      const r = await apiFetch<{ tags: Tag[] }>(API.etl.tags);
      setTags(r.tags || []);
    } catch {
      showToast({ message: 'Could not load tags', type: 'error' });
    }
  }

  // Skill responses are wrapped: { success, skill, function, recipe, data }.
  // The pool function returns `companies` and carries its own stats.
  const rows: Prospect[] = (isPool ? data?.data?.companies : data?.data?.prospects) ?? [];
  const total = data?.data?.total ?? 0;
  const stats = isPool ? data?.data?.stats : statsData?.data?.stats;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="GTM RECORDS"
        title="Companies"
        actions={selected.length > 0 && !isPool ? (
          <VdfButton variant="primary" onClick={openTagModal}>
            Tag {selected.length} selected
          </VdfButton>
        ) : undefined}
      />

      <div className={s.body}>
        {/* Scope. The pool tab only exists for an admin tenant — and the
            skill re-checks that against the database regardless. */}
        {isAdmin && (
          <div className={s.chips}>
            <button className={`${s.chip} ${!isPool ? s.chipActive : ''}`}
              onClick={() => { setScope('mine'); setSelected([]); }}>
              My companies
            </button>
            <button className={`${s.chip} ${isPool ? s.chipActive : ''}`}
              onClick={() => { setScope('pool'); setSelected([]); }}>
              Common pool
            </button>
          </div>
        )}

        {isPool && (
          <div className={s.note}>
            These are the <strong>source rows</strong> each delivery contributed.
            The merged company record they resolve into is not built yet, so
            nothing here has been de-duplicated across deliveries — rows sharing
            an identifier are flagged, not combined.
          </div>
        )}
        {/* Set health. Fill rate and validity side by side, never merged. */}
        {stats && (
          <div className={s.stats}>
            <VdfStatCard value={stats.total} label={isPool ? 'Source Rows' : 'Companies'} />
            {isPool ? (
              <VdfStatCard value={stats.loads ?? 0} label="Deliveries" accent="info" />
            ) : (
              <VdfStatCard value={stats.customers ?? 0} label="Customers" accent="success" />
            )}
            <VdfStatCard value={pct(stats.avg_completeness)} label="Avg Completeness" accent="info" />
            <VdfStatCard value={pct(stats.avg_validity)} label="Avg Validity"
              accent={Number(stats.avg_validity ?? 1) < 1 ? 'warning' : 'info'} />
            <VdfStatCard
              value={(isPool ? stats.sharing_block : stats.sharing_domain) ?? 0}
              label={isPool ? 'Share an Identifier' : 'Share a Domain'}
              accent={((isPool ? stats.sharing_block : stats.sharing_domain) ?? 0) > 0 ? 'warning' : undefined} />
            {isPool && (
              // 0 until the merge engine exists. Shown, not hidden.
              <VdfStatCard value={stats.resolved ?? 0} label="Merged into a Company" />
            )}
          </div>
        )}

        {stats && stats.with_rejected_fields > 0 && (
          <div className={s.note}>
            <strong>{stats.with_rejected_fields.toLocaleString()}</strong> record
            {stats.with_rejected_fields !== 1 ? 's have' : ' has'} at least one field
            that was populated but failed validation — a spreadsheet-mangled range,
            or a literal like <code>undefined+</code>. Those values were rejected at
            import rather than stored, which is why validity sits below 100%.
          </div>
        )}

        {/* Filters */}
        <div className={s.filters}>
          <VdfSearchBar value={search} onChange={setSearch} placeholder="Search name, domain, city, industry…" />
          <div className={s.chips}>
            {/* Prospect/customer is a tenant-side distinction — a pool row is
                nobody's customer, so these do not appear there. */}
            {!isPool && [
              { key: '', label: 'All' },
              { key: 'prospect', label: 'Prospects' },
              { key: 'customer', label: 'Customers' },
            ].map((r) => (
              <button key={r.key}
                className={`${s.chip} ${relationship === r.key ? s.chipActive : ''}`}
                onClick={() => setRelationship(r.key)}>
                {r.label}
              </button>
            ))}
            <button
              className={`${s.chip} ${onlyDuplicates ? s.chipActive : ''}`}
              onClick={() => setOnlyDuplicates((v) => !v)}
              title="Records sharing an identifier with another record"
            >
              Possible duplicates
              {(() => {
                const n = (isPool ? stats?.sharing_block : stats?.sharing_domain) ?? 0;
                return n ? ` (${n})` : '';
              })()}
            </button>
            {tagId !== null && (
              <button className={`${s.chip} ${s.chipActive}`} onClick={() => setTagId(null)}>
                Clear tag filter ✕
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <VdfLoader />
        ) : isError ? (
          <VdfEmptyState
            title="Could not load companies"
            description={(error as { message?: string })?.message || 'Unknown error'}
          />
        ) : rows.length === 0 ? (
          <VdfEmptyState
            title="No companies yet"
            description="Import a file from Import Data and the companies in it land here."
          />
        ) : (
          <div className={s.tableCard}>
            <table className={s.table}>
              <thead>
                <tr>
                  {/* Selection drives tagging, which only applies to a
                      tenant's own records. */}
                  {!isPool && <th style={{ width: 36 }}></th>}
                  <th>Company</th>
                  <th>Domain</th>
                  <th>Location</th>
                  <th>Industry</th>
                  <th>Quality</th>
                  <th>Source</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => setDetail(p)} className={s.row}>
                    {!isPool && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <VdfCheckbox
                          checked={selected.includes(p.id)}
                          onChange={(c) => setSelected((prev) =>
                            c ? [...prev, p.id] : prev.filter((x) => x !== p.id))}
                        />
                      </td>
                    )}
                    <td>
                      <div className={s.name}>{p.name}</div>
                      <div className={s.sub}>
                        {isPool ? p.source_record_id : p.ref}
                        {p.relationship === 'customer' && <> · <span className={s.customer}>Customer</span></>}
                        {(p.shares_domain || p.shares_name || p.shares_block) && (
                          <> · <span className={s.dupe}>
                            shares a {p.shares_domain || p.shares_block ? 'domain' : 'name'}
                          </span></>
                        )}
                      </div>
                    </td>
                    <td className={s.mono}>{p.domain_normalized ?? '—'}</td>
                    <td className={s.muted}>
                      {[p.city, p.state_code].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className={s.muted}>{p.industry_raw ?? '—'}</td>
                    <td>
                      <div className={s.quality}>
                        <span title="Share of tracked fields populated">{pct(p.completeness)} full</span>
                        <span
                          className={Number(p.validity ?? 1) < 1 ? s.badValidity : undefined}
                          title="Share of populated fields that passed validation"
                        >
                          {pct(p.validity)} valid
                        </span>
                      </div>
                    </td>
                    <td>
                      <VdfBadge variant={FRESHNESS[p.freshness].variant}>
                        {FRESHNESS[p.freshness].label}
                      </VdfBadge>
                      <div className={s.sub}>{p.load_label ?? '—'}</div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={s.tags}>
                        {p.tags.length === 0 ? <span className={s.muted}>—</span> : p.tags.map((t) => (
                          <button key={t.id} className={s.tag} onClick={() => setTagId(t.id)}
                            title={t.inherited ? 'From the delivery this record arrived in' : 'Added to this record'}>
                            {t.label}{t.inherited ? ' ·' : ''}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={s.footer}>
              Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Tag the selection. The vocabulary is the same one the import wizard
          offers, so a tag made at import is reusable here and vice versa. */}
      <VdfModal
        isOpen={tagModal}
        onClose={() => setTagModal(false)}
        title={`Tag ${selected.length} ${selected.length === 1 ? 'company' : 'companies'}`}
        subtitle="Tags added here belong to the records. Tags from the import belong to the delivery and stay."
        width="sm"
      >
        {tags.length === 0 ? (
          <p className={s.muted}>No tags yet. Create one while importing, and it appears here.</p>
        ) : (
          <div className={s.tagList}>
            {tags.map((t) => (
              <VdfButton key={t.id} variant="outline" disabled={tagging}
                onClick={() => applyTag({ prospect_ids: selected, tag_id: t.id })}>
                {t.label}
              </VdfButton>
            ))}
          </div>
        )}
      </VdfModal>

      {/* Row detail — the full record, and why its quality reads as it does. */}
      <VdfModal
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.name}
        subtitle={detail ? `${detail.ref ?? ''} · ${detail.relationship}` : undefined}
        width="md"
      >
        {detail && (
          <div className={s.detail}>
            {[
              ['Domain', detail.domain_normalized],
              ['Location', [detail.city, detail.state_code].filter(Boolean).join(', ')],
              ['Industry', detail.industry_raw],
              ['Employees', detail.employees_band],
              ['Completeness', `${pct(detail.completeness)} of tracked fields populated`],
              ['Validity', `${pct(detail.validity)} of populated fields passed validation`],
              ['Data as of', detail.source_as_of ? formatDate(detail.source_as_of) : 'Not stated — scored as less fresh'],
              ['Arrived in', detail.load_label],
            ].map(([label, value]) => (
              <div key={label as string} className={s.detailRow}>
                <span className={s.detailLabel}>{label}</span>
                <span>{(value as string) || '—'}</span>
              </div>
            ))}
            {(detail.shares_domain || detail.shares_name) && (
              <div className={s.note} style={{ marginTop: 12 }}>
                This record shares its {detail.shares_domain ? 'domain' : 'normalised name'} with
                another company. It was deliberately NOT merged — group companies
                and divisions share a website while being different businesses.
              </div>
            )}
          </div>
        )}
      </VdfModal>
    </div>
  );
}
