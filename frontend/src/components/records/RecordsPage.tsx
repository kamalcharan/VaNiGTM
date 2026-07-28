'use client';

/**
 * RecordsPage — ONE screen for both record surfaces.
 *
 * User ruling, repeated before it was acted on: both are the same shape, so
 * they share the same code, the same design and the same infrastructure. The
 * only difference is scope.
 *
 *   scope 'mine' -> /prospects    the tenant's own records
 *   scope 'pool' -> /common-pool  the shared directory, admin only
 *
 * Both read one skill function over one database view, so a filter, a column
 * or a fix lands on both by construction. Two copies of this screen is why
 * "show the full source row" had to be fixed twice, and the same habit let
 * is_live diverge and silently hide landed records.
 */

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { formatDate } from '@/lib/format';
import {
  VdfPageHeader, VdfLoader, VdfStatCard, VdfEmptyState,
  VdfSearchBar, VdfButton, VdfModal,
} from '@/components/vdf';
import {
  RecordTable, DetailRow, SourceRowSection, pct,
  type RecordRow, type RecordTag, type Freshness,
} from './RecordTable';
import s from '@/app/(app)/prospects/records.module.css';

export type Scope = 'mine' | 'pool';

/** One row, whichever table it came from — the view guarantees the shape. */
interface Record {
  id: number;
  ref: string | null;
  name: string;
  relationship: string | null;
  domain_normalized: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  state_code: string | null;
  pin: string | null;
  country: string | null;
  industry_raw: string | null;
  employees_band: string | null;
  revenue_band: string | null;
  linkedin_url: string | null;
  year_founded: number | null;
  description: string | null;
  completeness: string | null;
  validity: string | null;
  source_as_of: string | null;
  freshness: Freshness;
  duplicate: boolean;
  resolved: boolean | null;
  source_label: string | null;
  raw: Record_ | null;
  tags: RecordTag[];
}
type Record_ = { [k: string]: unknown };

interface Stats {
  total: number; loads: number; customers: number; resolved: number;
  avg_completeness: string | null; avg_validity: string | null;
  with_rejected_fields: number; with_domain: number;
  undated: number; duplicates: number;
}

export interface RecordsPageProps {
  scope: Scope;
  eyebrow: string;
  title: string;
  /** Shown above the stats. Used by the pool to say what its rows are. */
  intro?: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}

export function RecordsPage({
  scope, eyebrow, title, intro, emptyTitle, emptyDescription,
}: RecordsPageProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isPool = scope === 'pool';

  const [search, setSearch] = useState('');
  const [relationship, setRelationship] = useState('');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [tagId, setTagId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [tagModal, setTagModal] = useState(false);
  const [tags, setTags] = useState<RecordTag[]>([]);
  const [detail, setDetail] = useState<Record | null>(null);

  const params = useMemo(() => ({
    scope,
    search: search.trim() || undefined,
    // A pool row is nobody's customer, so this filter is meaningless there.
    ...(isPool ? {} : { relationship: relationship || undefined }),
    only_duplicates: onlyDuplicates || undefined,
    tag_id: tagId ?? undefined,
    limit: 100,
  }), [scope, isPool, search, relationship, onlyDuplicates, tagId]);

  const { data, isLoading, isError, error } = useSkillQuery<{
    records: Record[]; total: number; stats: Stats;
  }>('prospect-skill', 'get_records', params);

  const { mutate: applyTag, isPending: tagging } = useSkillMutation(
    'prospect-skill', 'tag_prospects',
    {
      onSuccess: (res: any) => {
        showToast({ message: `Tagged ${res?.data?.applied ?? 0} records`, type: 'success' });
        setSelected([]); setTagModal(false);
        queryClient.invalidateQueries({ queryKey: ['skill', 'prospect-skill', 'get_records'] });
      },
      onError: (err: any) => showToast({ message: err?.message || 'Could not tag', type: 'error' }),
    },
  );

  async function openTagModal() {
    setTagModal(true);
    try {
      const r = await apiFetch<{ tags: RecordTag[] }>(API.etl.tags);
      setTags(r.tags || []);
    } catch {
      showToast({ message: 'Could not load tags', type: 'error' });
    }
  }

  const rows = data?.data?.records ?? [];
  const total = data?.data?.total ?? 0;
  const stats = data?.data?.stats;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow={eyebrow}
        title={title}
        actions={selected.length > 0 && !isPool ? (
          <VdfButton variant="primary" onClick={openTagModal}>
            Tag {selected.length} selected
          </VdfButton>
        ) : undefined}
      />

      <div className={s.body}>
        {intro && <div className={s.note}>{intro}</div>}

        {/* Fill rate and validity side by side, never blended into one score. */}
        {stats && (
          <div className={s.stats}>
            <VdfStatCard value={stats.total} label={isPool ? 'Source Rows' : 'Records'} />
            <VdfStatCard
              value={isPool ? stats.loads : stats.customers}
              label={isPool ? 'Deliveries' : 'Customers'}
              accent={isPool ? 'info' : 'success'} />
            <VdfStatCard value={pct(stats.avg_completeness)} label="Avg Completeness" accent="info" />
            <VdfStatCard value={pct(stats.avg_validity)} label="Avg Validity"
              accent={Number(stats.avg_validity ?? 1) < 1 ? 'warning' : 'info'} />
            <VdfStatCard value={stats.duplicates} label="Share an Identifier"
              accent={stats.duplicates > 0 ? 'warning' : undefined} />
            {isPool && <VdfStatCard value={stats.resolved} label="Merged into a Company" />}
          </div>
        )}

        {stats && stats.with_rejected_fields > 0 && (
          <div className={s.note}>
            <strong>{stats.with_rejected_fields.toLocaleString()}</strong> record
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
              title="Records sharing an identifier with another record">
              Possible duplicates{stats?.duplicates ? ` (${stats.duplicates})` : ''}
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
          <VdfEmptyState title="Could not load records"
            description={(error as { message?: string })?.message || 'Unknown error'} />
        ) : rows.length === 0 ? (
          <VdfEmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <RecordTable
            rows={rows.map((r): RecordRow => ({
              id: r.id, name: r.name, ref: r.ref,
              domain_normalized: r.domain_normalized,
              city: r.city, state_code: r.state_code,
              industry_raw: r.industry_raw,
              completeness: r.completeness, validity: r.validity,
              freshness: r.freshness, duplicate: r.duplicate,
              source_label: r.source_label, tags: r.tags,
              badge: r.relationship === 'customer' ? 'Customer' : null,
            }))}
            total={total}
            selected={isPool ? undefined : selected}
            onSelect={isPool ? undefined : setSelected}
            onOpen={(row) => setDetail(rows.find((x) => x.id === row.id) ?? null)}
            onTagClick={setTagId}
          />
        )}
      </div>

      <VdfModal
        isOpen={tagModal}
        onClose={() => setTagModal(false)}
        title={`Tag ${selected.length} ${selected.length === 1 ? 'record' : 'records'}`}
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

      {/* The record in full — every mapped field, then every column the file
          carried. One definition, so it cannot go missing from one surface. */}
      <VdfModal
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.name}
        subtitle={detail ? `${detail.ref ?? ''}${detail.relationship ? ' · ' + detail.relationship : ''}` : undefined}
        width="lg"
      >
        {detail && (
          <div className={s.detail}>
            <DetailRow label="Domain"      value={detail.domain_normalized} />
            <DetailRow label="Website"     value={detail.website} />
            <DetailRow label="Email"       value={detail.email} />
            <DetailRow label="Phone"       value={detail.phone} />
            <DetailRow label="Address"     value={detail.address_line} />
            <DetailRow label="Location"    value={[detail.city, detail.state_code, detail.pin, detail.country].filter(Boolean).join(', ')} />
            <DetailRow label="Industry"    value={detail.industry_raw} />
            <DetailRow label="Employees"   value={detail.employees_band} />
            <DetailRow label="Revenue"     value={detail.revenue_band} />
            <DetailRow label="Year founded" value={detail.year_founded} />
            <DetailRow label="LinkedIn"    value={detail.linkedin_url} />
            <DetailRow label="Description" value={detail.description} />
            <DetailRow label="Completeness" value={`${pct(detail.completeness)} of tracked fields populated`} />
            <DetailRow label="Validity"    value={`${pct(detail.validity)} of populated fields passed validation`} />
            <DetailRow label="Data as of"  value={detail.source_as_of ? formatDate(detail.source_as_of) : 'Not stated — scored as less fresh'} />
            <DetailRow label="Delivery"    value={detail.source_label} />
            {isPool && (
              <DetailRow label="Merged into a company"
                value={detail.resolved ? 'Yes' : 'Not yet — the merge step is not built'} />
            )}

            <SourceRowSection raw={detail.raw} />

            {detail.duplicate && (
              <div className={s.note} style={{ marginTop: 12 }}>
                This record shares its identifier with another. Deliberately not
                merged — group companies and divisions share a website while
                being different businesses.
              </div>
            )}
          </div>
        )}
      </VdfModal>
    </div>
  );
}
