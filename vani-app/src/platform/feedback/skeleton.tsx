/**
 * Skeletons — the shape of the answer, shown while it is on its way.
 *
 * VaNiGTM has spinners but no skeletons, so this is an addition rather than a
 * port. The rule for choosing between them:
 *
 *   - Known shape (a list, a table, a counter strip) → skeleton. Content
 *     arrives without the page jumping, and the wait shows structure instead of
 *     a rotating shape that says nothing.
 *   - Unknown shape, or an action in flight (a button working) → Spinner.
 *   - First paint of a whole route → VaniLoader.
 *
 * Every skeleton is aria-hidden inside a container that announces the wait once.
 * A screen reader should hear "Loading agents", not eleven grey rectangles.
 */

import type { ReactNode } from 'react';
import styles from './skeleton.module.css';

/** Announces the wait once, politely, and hides the decoration from the AT tree. */
export function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className={styles.srOnly}>{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = 12,
  radius = 5,
}: {
  width?: string | number;
  height?: string | number;
  radius?: number;
}) {
  return <span className={styles.sk} style={{ width, height, borderRadius: radius }} />;
}

/** Stand-in for the counter strip at the top of a dashboard. */
export function SkeletonCounters({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.counters}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.counter}>
          <Skeleton width={54} height={25} radius={6} />
          <div className={styles.gap8} />
          <Skeleton width="70%" height={9} />
        </div>
      ))}
    </div>
  );
}

/**
 * Stand-in for a list of rows inside a card body.
 *
 * Widths vary by index rather than at random: a skeleton must render the same
 * on the server and on the client, and Math.random() guarantees it will not.
 */
export function SkeletonRows({ rows = 4, lines = 2 }: { rows?: number; lines?: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.row}>
          <Skeleton width={32} height={32} radius={8} />
          <div className={styles.rowBody}>
            <Skeleton width={`${52 + ((i * 13) % 30)}%`} height={12} />
            {Array.from({ length: Math.max(0, lines - 1) }, (_, j) => (
              <div key={j}>
                <div className={styles.gap7} />
                <Skeleton width={`${64 + ((i * 7 + j * 11) % 26)}%`} height={9} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stand-in for a table. Column count matters: the header must not reflow. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className={styles.tableWrap}>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className={styles.trow}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} width={`${58 + ((r * 9 + c * 17) % 34)}%`} height={11} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Whole-route fallback for Next's loading.tsx. */
export function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <Loading label={label}>
      <Skeleton width={110} height={10} />
      <div className={styles.gap14} />
      <Skeleton width="42%" height={26} radius={7} />
      <div className={styles.gap12} />
      <Skeleton width="78%" height={12} />
      <div className={styles.gap24} />
      <SkeletonCounters />
      <SkeletonRows rows={3} />
    </Loading>
  );
}
