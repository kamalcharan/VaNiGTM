'use client';

/**
 * Common Pool — company records delivered by directories and providers,
 * shared across tenants. The admin counterpart to /companies.
 *
 * Its own page rather than a tab, because it is not the tenant's data:
 * gt_universe_company_sources has no tenant_id at all. The nav entry is
 * adminOnly, this page refuses a non-admin, and get_universe_companies checks
 * vn_tenants.is_admin against the database — the gate is the whole protection,
 * so it is applied at every layer rather than once.
 */

import { useState, useMemo } from 'react';
import { useSkillQuery } from '@/hooks/useSkill';
import { useAuth } from '@/context/auth-provider';
import { formatDate } from '@/lib/format';
import {
  VdfPageHeader, VdfLoader, VdfStatCard, VdfBadge, VdfEmptyState,
  VdfSearchBar, VdfModal,
} from '@/components/vdf';
import s from '../companies/companies.module.css';

interface Tag { id: number; label: string; inherited: boolean }

interface PoolCompany {
  id: number;
  name: string;
  source_record_id: string;
  domain_normalized: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state_code: string | null;
  pin: string | null;
  country: string | null;
  industry_raw: string | null;
  employees_band: string | null;
  revenue_band: string | null;
  description: string | null;
  completeness: string | null;
  validity: string | null;
  source_as_of: string | null;
  freshness: 'current' | 'recent' | 'ageing' | 'stale' | 'unknown';
  resolved: boolean;
  shares_block: boolean;
  load_label: string | null;
  source_code: string | null;
  tags: Tag[];
}

interface PoolStats {
  total: number; loads: number; resolved: number;
  avg_completeness: string | null; avg_validity: string | null;
  with_rejected_fields: number; with_domain: number;
  undated: number; sharing_block: number;
}

const FRESHNESS: Record<string, { label: string; variant: 'success' | 'info' | 'default' | 'gold' }> = {
  current: { label: 'Current', variant: 'success' },
  recent:  { label: 'Recent',  variant: 'info'    },
  ageing:  { label: 'Ageing',  variant: 'gold'    },
  stale:   { label: 'Stale',   variant: 'default' },
  unknown: { label: 'Undated', variant: 'default' },
};

const pct = (v: string | null): string =>
  v === null ? '—' : `${Math.round(Number(v) * 100)}%`;

export default function CommonPoolPage() {
  const { isAdmin } = useAuth();

  const [search, setSearch] = useState('');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [tagId, setTagId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PoolCompany | null>(null);

  const params = useMemo(() => ({
    search: search.trim() || undefined,
    only_duplicates: onlyDuplicates || undefined,
    tag_id: tagId ?? undefined,
    limit: 100,
  }), [search, onlyDuplicates, tagId]);

  const { data, isLoading, isError, error } = useSkillQuery<{
    companies: PoolCompany[]; total: number; stats: PoolStats;
  }>('prospect-skill', 'get_universe_companies', params, { enabled: isAdmin });

  // A non-admin never renders the table at all. Said plainly rather than
  // shown as an empty list, which would read as "there is no data".
  if (!isAdmin) {
    return (
      <div className={s.page}>
        <VdfPageHeader eyebrow="SHARED DATA" title="Common Pool" />
        <div className={s.body}>
          <VdfEmptyState
            title="Admin tenants only"
            description="The common pool holds directory data shared across every tenant. Your own companies are under Companies."
          />
        </div>
      </div>
    );
  }

  const rows = data?.data?.companies ?? [];
  const total = data?.data?.total ?? 0;
  const stats = data?.data?.stats;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="SHARED DATA"
        title="Common Pool"
      />

      <div className={s.body}>
        {/* What these rows ARE. Saying it once, up front, beats a user
            wondering why 2,913 rows show 0 merged companies. */}
        <div className={s.note}>
          These are the <strong>source rows</strong> each delivery contributed —
          one per record per delivery, kept exactly as the file supplied them.
          The merged company record they resolve into is not built yet, so
          nothing here has been combined across deliveries: rows sharing an
          identifier are flagged for review, never silently merged.
        </div>

        {stats && (
          <div className={s.stats}>
            <VdfStatCard value={stats.total} label="Source Rows" />
            <VdfStatCard value={stats.loads} label="Deliveries" accent="info" />
            <VdfStatCard value={pct(stats.avg_completeness)} label="Avg Completeness" accent="info" />
            <VdfStatCard value={pct(stats.avg_validity)} label="Avg Validity"
              accent={Number(stats.avg_validity ?? 1) < 1 ? 'warning' : 'info'} />
            <VdfStatCard value={stats.sharing_block} label="Share an Identifier"
              accent={stats.sharing_block > 0 ? 'warning' : undefined} />
            <VdfStatCard value={stats.resolved} label="Merged into a Company" />
          </div>
        )}

        {stats && stats.with_rejected_fields > 0 && (
          <div className={s.note}>
            <strong>{stats.with_rejected_fields.toLocaleString()}</strong> row
            {stats.with_rejected_fields !== 1 ? 's have' : ' has'} a field that was
            populated but failed validation — a spreadsheet-mangled range, or a
            literal like <code>undefined+</code>. Rejected at import rather than
            stored, which is why validity sits below 100%.
          </div>
        )}

        <div className={s.filters}>
          <VdfSearchBar value={search} onChange={setSearch}
            placeholder="Search name, domain, city, industry…" />
          <div className={s.chips}>
            <button
              className={`${s.chip} ${onlyDuplicates ? s.chipActive : ''}`}
              onClick={() => setOnlyDuplicates((v) => !v)}
              title="Rows sharing a domain, or a normalised name and PIN, with another row"
            >
              Possible duplicates{stats?.sharing_block ? ` (${stats.sharing_block})` : ''}
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
            title="Could not load the pool"
            description={(error as { message?: string })?.message || 'Unknown error'}
          />
        ) : rows.length === 0 ? (
          <VdfEmptyState
            title="The pool is empty"
            description="Import a directory from Import Data, choosing 'Common pool dataset', and its rows land here."
          />
        ) : (
          <div className={s.tableCard}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Domain</th>
                  <th>Location</th>
                  <th>Industry</th>
                  <th>Quality</th>
                  <th>Delivery</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={s.row} onClick={() => setDetail(c)}>
                    <td>
                      <div className={s.name}>{c.name}</div>
                      <div className={s.sub}>
                        {c.source_record_id}
                        {c.shares_block && (
                          <> · <span className={s.dupe}>shares an identifier</span></>
                        )}
                      </div>
                    </td>
                    <td className={s.mono}>{c.domain_normalized ?? '—'}</td>
                    <td className={s.muted}>
                      {[c.city, c.state_code].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className={s.muted}>{c.industry_raw ?? '—'}</td>
                    <td>
                      <div className={s.quality}>
                        <span title="Share of tracked fields populated">{pct(c.completeness)} full</span>
                        <span
                          className={Number(c.validity ?? 1) < 1 ? s.badValidity : undefined}
                          title="Share of populated fields that passed validation"
                        >
                          {pct(c.validity)} valid
                        </span>
                      </div>
                    </td>
                    <td>
                      <VdfBadge variant={FRESHNESS[c.freshness].variant}>
                        {FRESHNESS[c.freshness].label}
                      </VdfBadge>
                      <div className={s.sub}>{c.load_label ?? '—'}</div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={s.tags}>
                        {c.tags.length === 0 ? <span className={s.muted}>—</span> : c.tags.map((t) => (
                          <button key={t.id} className={s.tag} onClick={() => setTagId(t.id)}
                            title="From the delivery this row arrived in">
                            {t.label}
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

      <VdfModal
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.name}
        subtitle={detail ? `${detail.source_code ?? 'source'} · ${detail.source_record_id}` : undefined}
        width="md"
      >
        {detail && (
          <div className={s.detail}>
            {[
              ['Domain', detail.domain_normalized],
              ['Website', detail.website],
              ['Email', detail.email],
              ['Phone', detail.phone],
              ['Location', [detail.city, detail.state_code, detail.pin, detail.country].filter(Boolean).join(', ')],
              ['Industry', detail.industry_raw],
              ['Employees', detail.employees_band],
              ['Revenue', detail.revenue_band],
              ['Description', detail.description],
              ['Completeness', `${pct(detail.completeness)} of tracked fields populated`],
              ['Validity', `${pct(detail.validity)} of populated fields passed validation`],
              ['Data as of', detail.source_as_of ? formatDate(detail.source_as_of) : 'Not stated — scored as less fresh'],
              ['Delivery', detail.load_label],
              ['Merged into a company', detail.resolved ? 'Yes' : 'Not yet — the merge step is not built'],
            ].map(([label, value]) => (
              <div key={label as string} className={s.detailRow}>
                <span className={s.detailLabel}>{label}</span>
                <span>{(value as string) || '—'}</span>
              </div>
            ))}
            {detail.shares_block && (
              <div className={s.note} style={{ marginTop: 12 }}>
                This row shares its identifier with another row in the pool.
                Deliberately not merged — group companies and divisions share a
                website while being different businesses.
              </div>
            )}
          </div>
        )}
      </VdfModal>
    </div>
  );
}
