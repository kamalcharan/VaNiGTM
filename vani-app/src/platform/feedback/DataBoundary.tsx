'use client';

/**
 * The four states every data view owes the user: loading, error, empty, content.
 *
 * Screens got these wrong individually before this existed — one card had a
 * loading line and no error branch, another rendered an em-dash for both "still
 * loading" and "the number is zero". Both are the same class of bug: a state
 * the screen did not think about becomes indistinguishable from a state it did.
 *
 * Two things are easy to miss and are handled here rather than in each screen:
 *
 *  1. `success: false` is a failure that arrives with HTTP 200. The transport
 *     wraps every skill call in `{ success, data, error }`, so a skill can
 *     refuse while the request itself is fine. Checking only `isError` renders
 *     an empty screen and calls it success.
 *  2. A background refetch is not a load. Once data is on screen, refreshing it
 *     must not blank the page — the skeleton is for the first arrival only,
 *     and staleness gets a quiet marker instead.
 */

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { SkillResult } from '@/lib/useSkill';
import { Loading } from './skeleton';
import { InlineLoader } from './loader';
import styles from './boundary.module.css';

interface DataBoundaryProps<T> {
  query: UseQueryResult<SkillResult<T>, Error>;
  /** What the user is waiting for, e.g. "agents". Used in every state's copy. */
  label: string;
  /** Shape-matched placeholder. Required: a spinner where a table belongs is a jump. */
  skeleton: ReactNode;
  /** True when the successful response has nothing to show. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}

export function DataBoundary<T>({
  query,
  label,
  skeleton,
  isEmpty,
  empty,
  children,
}: DataBoundaryProps<T>) {
  const { data, error, isPending, isFetching, refetch } = query;

  if (isPending) return <Loading label={`Loading ${label}`}>{skeleton}</Loading>;

  // Transport-level refusal: HTTP was fine, the skill said no.
  const failed = error ?? (data && !data.success ? new Error(data.error) : null);

  if (failed) {
    return (
      <div className={styles.state} role="alert">
        <div className={styles.stateIcon} aria-hidden="true">⚠</div>
        <div className={styles.stateTitle}>Could not load {label}.</div>
        {failed.message && <div className={styles.stateDetail}>{failed.message}</div>}
        <button type="button" className={styles.retry} onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <InlineLoader message="Retrying…" /> : 'Try again'}
        </button>
      </div>
    );
  }

  const payload = data?.data as T;

  if (isEmpty?.(payload)) {
    return (
      <div className={styles.state}>
        <div className={styles.stateIcon} aria-hidden="true">◍</div>
        <div className={styles.stateTitle}>No {label} yet.</div>
        {empty && <div className={styles.stateDetail}>{empty}</div>}
      </div>
    );
  }

  return (
    <>
      {/* Data is on screen and a refresh is in flight. Marked, never blanked. */}
      {isFetching && (
        <div className={styles.refreshing}>
          <InlineLoader message="Refreshing" />
        </div>
      )}
      {children(payload)}
    </>
  );
}
