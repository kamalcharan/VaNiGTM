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

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { formatDate } from '@/lib/format';
import {
  VdfPageHeader, VdfLoader, VdfStatCard, VdfEmptyState,
  VdfSearchBar, VdfButton, VdfModal, VdfCheckbox, VdfInput,
} from '@/components/vdf';
import {
  RecordTable, DetailRow, SourceRowSection, pct,
  COLUMNS, DEFAULT_COLUMNS,
  type RecordRow, type RecordTag, type Freshness,
} from './RecordTable';
import s from '@/app/(app)/gtm/audience/qualify/records.module.css';

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
  /** Derived cluster / segment (migrations 206, 218). */
  industry_canonical: string | null;
  industry_sub: string | null;
  /** Research state, derived from the brief — NOT a tag. */
  research_status: string | null;
  researched: boolean | null;
  research_decided: boolean | null;
  research_offer: string | null;
  researched_at: string | null;
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

interface Facets {
  industries: { value: string; count: number }[];
  tags: { id: number; label: string; count: number }[];
  /** Derived cluster / segment — short lists, so usable as dropdowns. */
  clusters: { value: string; count: number }[];
  segments: { value: string; cluster: string; count: number }[];
  research: { none?: number; done?: number; failed?: number; decided?: number };
  with_domain: number;
  without_domain: number;
}

interface Segment {
  id: number; name: string; note: string | null;
  definition: SegmentDefinition;
  summary: string;
  member_count: number | null;
  live_count: number;
  with_website: number;
  /** Research coverage — what a membership change actually costs. */
  researched: number;
  decided: number;
  research_failed: number;
  unresearched: number;
  /** The data moved under a stable rule. */
  drifted: boolean;
  /** The classification rules themselves changed — the same name may now
   *  cover different companies. A different problem with a different fix. */
  rules_moved: boolean;
}

interface SegmentDefinition {
  search?: string; industry_canonical?: string; industry_sub?: string;
  domain?: string; tag_id?: number; relationship?: string;
  min_quality?: number; city?: string; state_code?: string;
}

const RESEARCH_STATES: { value: string; label: string; key: keyof Facets['research'] }[] = [
  { value: 'none', label: 'Not researched', key: 'none' },
  { value: 'done', label: 'Researched', key: 'done' },
  { value: 'failed', label: 'Research failed', key: 'failed' },
  { value: 'decided', label: 'You ruled on', key: 'decided' },
];

interface Stats {
  total: number; loads: number; customers: number; resolved: number;
  avg_completeness: string | null; avg_validity: string | null;
  with_rejected_fields: number; with_domain: number;
  undated: number; duplicates: number; inactive: number;
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
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isPool = scope === 'pool';

  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [cluster, setCluster] = useState('');
  const [sub, setSub] = useState('');
  const [research, setResearch] = useState('');
  const [segmentId, setSegmentId] = useState<number | null>(null);
  const [saveSeg, setSaveSeg] = useState(false);
  const [segName, setSegName] = useState('');
  const [segNote, setSegNote] = useState('');
  const [domain, setDomain] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [chooser, setChooser] = useState(false);
  // Remembered per surface: a user who hides Quality on the pool has not said
  // anything about their prospects.
  const [visible, setVisible] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLUMNS;
    try {
      const saved = window.localStorage.getItem(`records.columns.${scope}`);
      return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
    } catch { return DEFAULT_COLUMNS; }
  });

  function toggleColumn(key: string) {
    setVisible((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { window.localStorage.setItem(`records.columns.${scope}`, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }
  const [relationship, setRelationship] = useState('');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [tagId, setTagId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [tagModal, setTagModal] = useState(false);
  const [tags, setTags] = useState<RecordTag[]>([]);
  const [detail, setDetail] = useState<Record | null>(null);

  const PAGE_SIZE = 50;

  const params = useMemo(() => ({
    scope,
    search: search.trim() || undefined,
    // A pool row is nobody's customer, so this filter is meaningless there.
    ...(isPool ? {} : { relationship: relationship || undefined }),
    industry: industry || undefined,
    industry_canonical: cluster || undefined,
    industry_sub: sub || undefined,
    research: research || undefined,
    domain: domain || undefined,
    only_duplicates: onlyDuplicates || undefined,
    show_inactive: showInactive || undefined,
    tag_id: tagId ?? undefined,
    page,
    limit: PAGE_SIZE,
  }), [scope, isPool, search, relationship, industry, cluster, sub, research,
       domain, onlyDuplicates, showInactive, tagId, page]);

  // Any filter change invalidates the current page — page 7 of a narrowed
  // result is usually empty, which reads as "no matches".
  useEffect(() => { setPage(1); },
    [search, relationship, industry, cluster, sub, research, domain,
     onlyDuplicates, showInactive, tagId]);

  const { data, isLoading, isError, error } = useSkillQuery<{
    records: Record[]; total: number; page: number; limit: number;
    stats: Stats; facets: Facets;
  }>('prospect-skill', 'get_records', params);

  // Segments are a 'mine' concept: a pool row is nobody's working set.
  const segmentsQ = useSkillQuery<{ segments: Segment[] }>(
    'prospect-skill', 'get_segments', {}, { enabled: !isPool },
  );
  const saveSegment = useSkillMutation('prospect-skill', 'save_segment');
  const deleteSegment = useSkillMutation('prospect-skill', 'delete_segment');
  const segments = segmentsQ.data?.data.segments ?? [];

  /** The filter as a segment definition — the same shape the backend stores. */
  const currentDefinition = (): SegmentDefinition => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(cluster ? { industry_canonical: cluster } : {}),
    ...(sub ? { industry_sub: sub } : {}),
    ...(domain ? { domain } : {}),
    ...(tagId ? { tag_id: tagId } : {}),
    ...(relationship ? { relationship } : {}),
  });

  const definitionIsEmpty = Object.keys(currentDefinition()).length === 0;

  /** Load a saved segment back INTO the controls, so it stays editable. */
  function applySegment(seg: Segment) {
    const d = seg.definition ?? {};
    setSearch(d.search ?? '');
    setCluster(d.industry_canonical ?? '');
    setSub(d.industry_sub ?? '');
    setDomain(d.domain ?? '');
    setTagId(d.tag_id ?? null);
    setRelationship(d.relationship ?? '');
    setSegmentId(seg.id);
    setPage(1);
  }

  async function onSaveSegment() {
    try {
      const res = await saveSegment.mutateAsync({
        segment_id: segmentId ?? undefined,
        name: segName,
        note: segNote || undefined,
        definition: currentDefinition(),
      });
      const { member_count } = (res.data ?? {}) as unknown as { member_count: number };
      showToast({
        type: 'success',
        message: `Saved "${segName}" — ${member_count} compan${member_count === 1 ? 'y' : 'ies'}.`,
      });
      setSaveSeg(false); setSegName(''); setSegNote('');
      queryClient.invalidateQueries({ queryKey: ['skill', 'prospect-skill'] });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not save' });
    }
  }

  async function onDeleteSegment(seg: Segment) {
    if (!window.confirm(`Remove the segment "${seg.name}"? The companies in it are untouched.`)) return;
    try {
      await deleteSegment.mutateAsync({ segment_id: seg.id });
      if (segmentId === seg.id) setSegmentId(null);
      queryClient.invalidateQueries({ queryKey: ['skill', 'prospect-skill'] });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Could not remove it' });
    }
  }

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
  const facets = data?.data?.facets;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            {/* Inactive rows are hidden, not unreachable. Only offered when
                there are some — a toggle for zero rows is noise. */}
            {!isPool && (stats?.inactive ?? 0) > 0 && (
              <button
                className={`${s.chip} ${showInactive ? s.chipActive : ''}`}
                onClick={() => setShowInactive((v) => !v)}>
                Include inactive ({stats!.inactive})
              </button>
            )}
          </div>

          {/* Values come from the data, so a dropdown never offers an option
              that matches nothing. */}
          <div className={s.chips}>
            {/* The DERIVED classification comes first. industry_raw is a
                product description with a 2,000-value long tail; the cluster
                and segment are the two anyone actually filters on, and they
                are what a cohort is built from. */}
            {!isPool && (facets?.clusters ?? []).length > 0 && (
              <select className={s.select} value={cluster}
                onChange={(e) => { setCluster(e.target.value); setSub(''); }}>
                <option value="">Any cluster</option>
                {(facets?.clusters ?? []).map((c) => (
                  <option key={c.value} value={c.value}>{c.value} ({c.count})</option>
                ))}
              </select>
            )}

            {!isPool && (facets?.segments ?? []).length > 0 && (
              <select className={s.select} value={sub}
                onChange={(e) => setSub(e.target.value)}>
                <option value="">Any segment</option>
                {(facets?.segments ?? [])
                  .filter((x) => !cluster || x.cluster === cluster)
                  .map((x) => (
                    <option key={x.value} value={x.value}>{x.value} ({x.count})</option>
                  ))}
              </select>
            )}

            {!isPool && (
              <select className={s.select} value={research}
                onChange={(e) => setResearch(e.target.value)}>
                <option value="">Any research state</option>
                {RESEARCH_STATES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} ({facets?.research?.[r.key] ?? 0})
                  </option>
                ))}
              </select>
            )}

            <select className={s.select} value={industry}
              onChange={(e) => setIndustry(e.target.value)}>
              <option value="">All industries</option>
              {(facets?.industries ?? []).map((i) => (
                <option key={i.value} value={i.value}>{i.value} ({i.count})</option>
              ))}
            </select>

            <select className={s.select} value={tagId ?? ''}
              onChange={(e) => setTagId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All tags</option>
              {(facets?.tags ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.label} ({t.count})</option>
              ))}
            </select>

            <select className={s.select} value={domain}
              onChange={(e) => setDomain(e.target.value)}>
              <option value="">Any domain</option>
              <option value="has">Has a domain ({facets?.with_domain ?? 0})</option>
              <option value="none">No domain ({facets?.without_domain ?? 0})</option>
            </select>

            <button className={s.chip} onClick={() => setChooser(true)}>
              Columns ({visible.length}/{COLUMNS.length})
            </button>
          </div>

          {/* ── Segments ──────────────────────────────────────────────
              A segment IS this filter, named and kept. Built here rather
              than on a page of its own (design note R4): the definition and
              the thing it defines have to be visible at the same time, or
              you are editing a query you cannot see the result of. The pilot
              cohort came out of a CLI script, which is the clearest way this
              product has failed its user. */}
          {!isPool && (
            <div className={s.chips}>
              {segments.map((seg) => (
                <span key={seg.id} className={s.segmentWrap}>
                  <button
                    className={`${s.chip} ${segmentId === seg.id ? s.chipActive : ''}`}
                    onClick={() => applySegment(seg)}
                    title={[
                      seg.summary,
                      `${seg.with_website} with a website`,
                      `${seg.researched} researched`,
                      seg.unresearched > 0 ? `${seg.unresearched} not read yet` : null,
                      seg.decided > 0 ? `${seg.decided} you ruled on` : null,
                      seg.rules_moved
                        ? 'The industry rules changed since this was saved — it may cover different companies now'
                        : seg.drifted ? `Saved with ${seg.member_count}, now ${seg.live_count}` : null,
                    ].filter(Boolean).join(' · ')}
                  >
                    {seg.name} ({seg.live_count})
                    {/* Coverage, not a dot. "8 unread" is a thing to act on;
                        "membership may have moved" is not. */}
                    {seg.unresearched > 0 && (
                      <span className={s.segmentFlag}>
                        {' '}· {seg.unresearched} unread
                      </span>
                    )}
                    {(seg.drifted || seg.rules_moved) && (
                      <span className={s.segmentFlag}>{' '}•</span>
                    )}
                  </button>
                  <button
                    className={s.segmentX}
                    onClick={() => onDeleteSegment(seg)}
                    title={`Remove "${seg.name}"`}
                    aria-label={`Remove ${seg.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}

              <button
                className={s.chip}
                disabled={definitionIsEmpty}
                title={definitionIsEmpty
                  ? 'Narrow the list first — a segment that selects everything is not a segment'
                  : 'Save this filter as a named segment'}
                onClick={() => { setSaveSeg(true); setSegName(''); setSegNote(''); }}
              >
                + Save as segment
              </button>

              {segmentId !== null && (
                <>
                  {/* The acknowledgement, made an action. The saved count is
                      never auto-updated — that number is the evidence anything
                      changed — so re-stamping it is something a human does
                      after looking at the new one. */}
                  {(() => {
                    const seg = segments.find((x) => x.id === segmentId);
                    if (!seg || (!seg.drifted && !seg.rules_moved)) return null;
                    return (
                      <button
                        className={s.chip}
                        disabled={saveSegment.isPending}
                        title={seg.rules_moved
                          ? 'The classification rules moved. Nothing already researched is affected — briefs belong to companies, not segments — but this name may now cover a different set. Re-count to accept the new one.'
                          : `Saved with ${seg.member_count}, now ${seg.live_count}. Re-count to accept it.`}
                        onClick={async () => {
                          await saveSegment.mutateAsync({ segment_id: seg.id, recount: true });
                          queryClient.invalidateQueries({ queryKey: ['skill', 'prospect-skill'] });
                          showToast({ type: 'success', message: `"${seg.name}" re-counted at ${seg.live_count}.` });
                        }}
                      >
                        Re-count ({segments.find((x) => x.id === segmentId)?.live_count})
                      </button>
                    );
                  })()}
                  <button className={s.chip} onClick={() => setSegmentId(null)}>
                    Detach from segment
                  </button>
                </>
              )}
            </div>
          )}
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
            onOpen={(row) => {
              const full = rows.find((x) => x.id === row.id) ?? null;
              // A tenant's own record gets the full dossier page (design note
              // R5). A modal cannot hold the research, the evidence and the
              // decision at once, and a decision made in a box you have to
              // scroll inside is a decision made on half the information.
              // Pool rows have no ref and no brief, so they keep the modal.
              if (!isPool && full?.ref) { router.push(`/gtm/audience/qualify/${full.ref}`); return; }
              setDetail(full);
            }}
            onTagClick={setTagId}
            columns={visible}
          />
        )}

        {/* Paging. Shown only when there is more than one page, so a small
            result set is not decorated with controls that do nothing. */}
        {lastPage > 1 && (
          <div className={s.pager}>
            <button className={s.chip} disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>← Previous</button>
            <span className={s.muted}>
              Page {page} of {lastPage.toLocaleString()} · {total.toLocaleString()} records
            </span>
            <button className={s.chip} disabled={page >= lastPage}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>Next →</button>
          </div>
        )}
      </div>

      {/* ── Name this filter ─────────────────────────────────────── */}
      <VdfModal
        isOpen={saveSeg}
        onClose={() => setSaveSeg(false)}
        title={segmentId ? 'Update this segment' : 'Save as a segment'}
        subtitle="A segment is this filter, kept. It stores the definition, not a list — so a company that gains a website tomorrow joins on its own."
        footer={(
          <div className={s.modalActions}>
            <VdfButton variant="outline" onClick={() => setSaveSeg(false)}>Cancel</VdfButton>
            <VdfButton
              variant="primary"
              disabled={!segName.trim() || saveSegment.isPending}
              onClick={onSaveSegment}
            >
              {saveSegment.isPending ? 'Saving…' : 'Save'}
            </VdfButton>
          </div>
        )}
      >
        <div className={s.note} style={{ marginBottom: 16 }}>
          Selecting <strong>{total}</strong> compan{total === 1 ? 'y' : 'ies'} right now.
        </div>
        <VdfInput
          label="Name"
          placeholder="Pharma manufacturers with a website"
          value={segName}
          onChange={(e) => setSegName(e.target.value)}
        />
        <VdfInput
          label="Why this group (optional)"
          placeholder="Bulk drug makers in Telangana — the pilot cohort"
          value={segNote}
          onChange={(e) => setSegNote(e.target.value)}
        />
      </VdfModal>

      <VdfModal
        isOpen={chooser}
        onClose={() => setChooser(false)}
        title="Columns"
        subtitle="Remembered for this screen on this browser. Company always shows."
        width="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {COLUMNS.map((c) => (
            <VdfCheckbox
              key={c.key}
              checked={visible.includes(c.key)}
              onChange={() => toggleColumn(c.key)}
              label={c.label}
            />
          ))}
        </div>
      </VdfModal>

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
