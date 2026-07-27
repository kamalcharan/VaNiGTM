'use client';

/**
 * DesignShell — shared chrome for the /design/* review screens
 * (POA Phase 1.2). Renders the ambient backdrop, the review bar
 * (breadcrumb + theme flip), and the screen header. Everything inside
 * is a pixel-final design composed from VDF + theme tokens with
 * synthetic data only.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/config/theme';
import { VdfAtmosphere, VdfGridOverlay } from '@/components/vdf';
import s from './design-shell.module.css';

const REVIEW_THEMES = ['neural-ops', 'vikuna-black'];

export function DesignShell({
  path,
  eyebrow,
  title,
  lede,
  children,
}: {
  /** Route shown in the review bar — e.g. "/design/war-room" */
  path: string;
  /** Mono eyebrow above the title — e.g. "WAR ROOM" */
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  const { themeId, setTheme, themes } = useTheme();
  // Theme comes from localStorage on the client — only mark the active chip
  // after mount so SSR and first client render match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className={s.screen}>
      <VdfAtmosphere />
      <VdfGridOverlay />

      <div className={s.reviewBar}>
        <span className={s.reviewLabel}>
          <Link href="/design" className={s.reviewHome}>DESIGN REVIEW</Link>
          {' · '}{path}{' · synthetic data'}
        </span>
        <div className={s.themeChips}>
          {REVIEW_THEMES.map((id) => (
            <button
              key={id}
              type="button"
              className={`${s.themeChip} ${mounted && themeId === id ? s.themeChipActive : ''}`}
              onClick={() => setTheme(id)}
            >
              {themes.find((t) => t.id === id)?.name ?? id}
            </button>
          ))}
        </div>
      </div>

      <header className={s.pageHead}>
        <span className={s.eyebrow}>{eyebrow}</span>
        <h1 className={s.title}>{title}</h1>
        {lede && <p className={s.lede}>{lede}</p>}
      </header>

      <main className={s.content}>{children}</main>
    </div>
  );
}

/** Titled glass panel — the standard section container on design screens. */
export function Panel({
  label,
  actions,
  children,
  className,
}: {
  label: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${s.panel} ${className || ''}`}>
      <header className={s.panelHead}>
        <span className={s.panelLabel}>{label}</span>
        {actions && <div className={s.panelActions}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Operational data table — mono headers, string cells; first column emphasized. */
export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={ci === 0 ? s.cellStrong : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Stat tile row — hero numbers with mono labels. */
export function StatRow({
  stats,
}: {
  stats: { label: string; value: string; tone?: 'default' | 'primary' | 'success' | 'warning' }[];
}) {
  return (
    <div className={s.statRow}>
      {stats.map((st) => (
        <div key={st.label} className={s.stat}>
          <span className={`${s.statValue} ${s[`tone_${st.tone || 'default'}`]}`}>{st.value}</span>
          <span className={s.statLabel}>{st.label}</span>
        </div>
      ))}
    </div>
  );
}
