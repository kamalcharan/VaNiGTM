'use client';

import s from './icp-builder-page.module.css';

/**
 * Per-field save-status indicator for the ICP builder's auto-save-on-blur
 * fields. Not a VDF component yet — local to this route until the pattern
 * proves out across more than one screen.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStatusIndicatorProps {
  state: SaveState;
  onRetry?: () => void;
}

export function SaveStatusIndicator({ state, onRetry }: SaveStatusIndicatorProps) {
  if (state === 'idle') return null;

  if (state === 'saving') {
    return <span className={`${s.saveStatus} ${s.saveStatusSaving}`}>Saving…</span>;
  }

  if (state === 'saved') {
    return <span className={`${s.saveStatus} ${s.saveStatusSaved}`}>{'✓'} Saved</span>;
  }

  return (
    <button
      type="button"
      className={`${s.saveStatus} ${s.saveStatusError}`}
      onClick={onRetry}
      title="Save failed — click to retry"
    >
      {'⚠'} Retry
    </button>
  );
}
