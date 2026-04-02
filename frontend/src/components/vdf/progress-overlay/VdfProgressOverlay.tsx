'use client';

import s from './VdfProgressOverlay.module.css';

export interface ProgressItem {
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
}

export interface VdfProgressOverlayProps {
  /** Title of the operation */
  title: string;
  /** Current progress (0-100) */
  progress: number;
  /** e.g. "3 of 20 schemes" */
  progressText: string;
  /** Individual items with status */
  items: ProgressItem[];
  /** VaNi message */
  vaniMessage?: string;
  /** Cancel handler (optional) */
  onCancel?: () => void;
}

/**
 * VdfProgressOverlay — Full-screen overlay for sequential bulk operations.
 *
 * Shows: title, progress bar, item-by-item status, VaNi narration, cancel button.
 * Used for: bulk NAV downloads, bulk metrics calculation.
 */
export function VdfProgressOverlay({ title, progress, progressText, items, vaniMessage, onCancel }: VdfProgressOverlayProps) {
  return (
    <div className={s.overlay}>
      <div className={s.card}>
        {/* Header */}
        <h2 className={s.title}>{title}</h2>
        <div className={s.progressText}>{progressText}</div>

        {/* Progress bar */}
        <div className={s.progressTrack}>
          <div className={s.progressFill} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>

        {/* Items */}
        <div className={s.items}>
          {items.map((item, i) => (
            <div key={i} className={`${s.item} ${s[`is_${item.status}`]}`}>
              <span className={s.itemIcon}>
                {item.status === 'done' ? '\u2713' : item.status === 'failed' ? '\u2717' : item.status === 'running' ? '\u21BB' : '\u00B7'}
              </span>
              <span className={s.itemLabel}>{item.label}</span>
              {item.detail && <span className={s.itemDetail}>{item.detail}</span>}
            </div>
          ))}
        </div>

        {/* VaNi */}
        {vaniMessage && (
          <div className={s.vani}>
            <span>{'\u2728'}</span>
            <span>{vaniMessage}</span>
          </div>
        )}

        {/* Cancel */}
        {onCancel && (
          <button className={s.cancelBtn} onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  );
}
