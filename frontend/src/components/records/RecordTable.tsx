'use client';

/**
 * RecordTable — ONE table for every imported-record surface.
 *
 * User ruling (2026-07-28): *"why do we need so many code paths … it should be
 * 1 single code — just a flag."*
 *
 * /companies and /common-pool were 731 lines across two files rendering the
 * same table, the same stat tiles, the same filters, the same freshness map
 * and the same detail rows. That duplication is not merely untidy — it is the
 * reason "show the full source row" had to be fixed twice, and why the second
 * page went a whole round without it. The same habit produced two resolutions
 * of `is_live`, which silently hid landed records.
 *
 * So the difference between the two screens is now DATA, not code: which rows,
 * which stat tiles, which columns. Everything else is here, once.
 */

import { type ReactNode } from 'react';
import { VdfBadge, VdfCheckbox } from '@/components/vdf';
import s from '@/app/(app)/prospects/records.module.css';

export type Freshness = 'current' | 'recent' | 'ageing' | 'stale' | 'unknown';

export const FRESHNESS: Record<Freshness, { label: string; variant: 'success' | 'info' | 'default' | 'gold' }> = {
  current: { label: 'Current', variant: 'success' },
  recent:  { label: 'Recent',  variant: 'info'    },
  ageing:  { label: 'Ageing',  variant: 'gold'    },
  stale:   { label: 'Stale',   variant: 'default' },
  unknown: { label: 'Undated', variant: 'default' },
};

/** Percentages arrive from PostgreSQL NUMERIC as strings, never as numbers. */
export const pct = (v: string | null | undefined): string =>
  v === null || v === undefined ? '—' : `${Math.round(Number(v) * 100)}%`;

export interface RecordTag { id: number; label: string; inherited: boolean }

/**
 * The shape every record surface shares. A tenant company and a pool source
 * row differ in where they came from, not in what a table needs from them.
 */
export interface RecordRow {
  id: number;
  name: string;
  /** PROS-0001 for a tenant record, the source's own id for a pool row. */
  ref: string | null;
  domain_normalized: string | null;
  city: string | null;
  state_code: string | null;
  industry_raw: string | null;
  completeness: string | null;
  validity: string | null;
  freshness: Freshness;
  /** Shares an identifier with another record — flagged, never merged. */
  duplicate: boolean;
  source_label: string | null;
  tags: RecordTag[];
  /** Free-text note under the name, e.g. "Customer". */
  badge?: string | null;
}

export interface RecordTableProps {
  rows: RecordRow[];
  total: number;
  /** Selection enables bulk tagging. Omit to render no checkbox column. */
  selected?: number[];
  onSelect?: (ids: number[]) => void;
  onOpen: (row: RecordRow) => void;
  onTagClick?: (tagId: number) => void;
  emptyLabel?: ReactNode;
}

export function RecordTable({
  rows, total, selected, onSelect, onOpen, onTagClick,
}: RecordTableProps) {
  const selectable = Boolean(selected && onSelect);

  return (
    <div className={s.tableCard}>
      <table className={s.table}>
        <thead>
          <tr>
            {selectable && <th style={{ width: 36 }} />}
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
          {rows.map((r) => (
            <tr key={r.id} className={s.row} onClick={() => onOpen(r)}>
              {selectable && (
                <td onClick={(e) => e.stopPropagation()}>
                  <VdfCheckbox
                    checked={selected!.includes(r.id)}
                    onChange={(c) => onSelect!(
                      c ? [...selected!, r.id] : selected!.filter((x) => x !== r.id),
                    )}
                  />
                </td>
              )}
              <td>
                <div className={s.name}>{r.name}</div>
                <div className={s.sub}>
                  {r.ref}
                  {r.badge && <> · <span className={s.customer}>{r.badge}</span></>}
                  {r.duplicate && <> · <span className={s.dupe}>shares an identifier</span></>}
                </div>
              </td>
              <td className={s.mono}>{r.domain_normalized ?? '—'}</td>
              <td className={s.muted}>
                {[r.city, r.state_code].filter(Boolean).join(', ') || '—'}
              </td>
              <td className={s.muted}>{r.industry_raw ?? '—'}</td>
              <td>
                {/* Two numbers, never blended. Fill rate is not quality: the
                    profiled file read 100% populated on revenue while most of
                    those values were the literal string 'undefined+'. */}
                <div className={s.quality}>
                  <span title="Share of tracked fields populated">{pct(r.completeness)} full</span>
                  <span
                    className={Number(r.validity ?? 1) < 1 ? s.badValidity : undefined}
                    title="Share of populated fields that passed validation"
                  >
                    {pct(r.validity)} valid
                  </span>
                </div>
              </td>
              <td>
                <VdfBadge variant={FRESHNESS[r.freshness].variant}>
                  {FRESHNESS[r.freshness].label}
                </VdfBadge>
                <div className={s.sub}>{r.source_label ?? '—'}</div>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className={s.tags}>
                  {r.tags.length === 0 ? <span className={s.muted}>—</span> : r.tags.map((t) => (
                    <button
                      key={t.id}
                      className={s.tag}
                      onClick={() => onTagClick?.(t.id)}
                      title={t.inherited ? 'From the delivery this record arrived in' : 'Added to this record'}
                    >
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
  );
}

/* ── Detail rows ──────────────────────────────────────────────────────── */

/** A label/value pair inside a record detail modal. */
export function DetailRow({ label, value }: { label: string; value: unknown }) {
  const text =
    value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className={s.detailRow}>
      <span className={s.detailLabel}>{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{text}</span>
    </div>
  );
}

/**
 * Every column the file carried, shown in full.
 *
 * Lives here so it cannot go missing from one surface and not the other —
 * which is exactly what happened when /companies had it and /common-pool
 * did not.
 */
export function SourceRowSection({ raw }: { raw: Record<string, unknown> | null | undefined }) {
  if (!raw || Object.keys(raw).length === 0) return null;
  return (
    <>
      <div className={s.detailLabel} style={{ marginTop: 20, marginBottom: 6 }}>
        Everything from your file ({Object.keys(raw).length} columns)
      </div>
      {Object.entries(raw).map(([col, value]) => (
        <DetailRow key={col} label={col} value={value} />
      ))}
    </>
  );
}
