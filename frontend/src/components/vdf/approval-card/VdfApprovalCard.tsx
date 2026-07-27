'use client';

import { useEffect, useRef, useState } from 'react';
import { VdfButton } from '../button/VdfButton';
import s from './VdfApprovalCard.module.css';

export interface VdfApprovalCardProps {
  /** Mono eyebrow naming the producing agent — e.g. "VANI · RESEARCHED" */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Agent-produced content — the thing being approved */
  children: React.ReactNode;
  status?: 'draft' | 'confirmed';
  onConfirm?: () => void;
  onEdit?: () => void;
  confirmLabel?: string;
  editLabel?: string;
  loading?: boolean;
  /**
   * Auto-confirm countdown in ms. The agent keeps the flow moving on its
   * own; the human only has to act to CHANGE something. Any interaction
   * inside the card (pointer, focus, key) cancels the countdown for good —
   * once you touch your data, nothing commits it but you.
   */
  autoConfirmMs?: number;
  className?: string;
}

/**
 * VdfApprovalCard — the core surface of the agent-led wizard
 * (ux-references pattern 1: "agent produces, human confirms").
 * Opens with the agent's finished work, not an empty form; the human
 * edits or confirms and moves on. Confirmed cards drop their action
 * row and show a sealed state.
 */
export function VdfApprovalCard({
  eyebrow = 'Agent produced',
  title,
  subtitle,
  children,
  status = 'draft',
  onConfirm,
  onEdit,
  confirmLabel = 'Confirm & continue',
  editLabel = 'Edit',
  loading,
  autoConfirmMs,
  className,
}: VdfApprovalCardProps) {
  const confirmed = status === 'confirmed';

  /* ── Auto-confirm countdown ──────────────────────────────────────────
     Runs only while the card is actionable and untouched. Cancelling is
     permanent for this card: a human who has started editing must be the
     one who commits. Reduced-motion users get no timer at all — an
     unrequested state change is exactly what that preference asks us to
     avoid. */
  const [remaining, setRemaining] = useState<number | null>(null);
  const cancelledRef = useRef(false);
  const cardRef = useRef<HTMLElement>(null);

  const armed = Boolean(autoConfirmMs && onConfirm && !confirmed && !loading);

  useEffect(() => {
    if (!armed || cancelledRef.current) { setRemaining(null); return; }
    if (typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setRemaining(null);
      return;
    }

    let left = Math.ceil((autoConfirmMs as number) / 1000);
    setRemaining(left);

    const tick = setInterval(() => {
      left -= 1;
      if (cancelledRef.current) { clearInterval(tick); setRemaining(null); return; }
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        setRemaining(null);
        if (!cancelledRef.current) onConfirm?.();
      }
    }, 1000);

    return () => clearInterval(tick);
    // onConfirm is intentionally omitted: a re-created callback must not
    // restart a countdown the human has already been watching run down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, autoConfirmMs]);

  const cancelAuto = () => {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    setRemaining(null);
  };

  const counting = remaining !== null && remaining > 0;

  return (
    <section
      ref={cardRef}
      className={`${s.card} ${confirmed ? s.confirmed : ''} ${className || ''}`}
      onPointerDownCapture={counting ? cancelAuto : undefined}
      onFocusCapture={counting ? cancelAuto : undefined}
      onKeyDownCapture={counting ? cancelAuto : undefined}
    >
      <header className={s.head}>
        <div className={s.eyebrowRow}>
          <span className={`${s.agentDot} ${confirmed ? s.agentDotDone : ''}`} aria-hidden />
          <span className={s.eyebrow}>{eyebrow}</span>
          {confirmed && <span className={s.sealed}>Confirmed</span>}
        </div>
        <h2 className={s.title}>{title}</h2>
        {subtitle && <p className={s.subtitle}>{subtitle}</p>}
      </header>

      <div className={s.body}>{children}</div>

      {!confirmed && (onConfirm || onEdit) && (
        <footer className={s.actions}>
          {onEdit && (
            <VdfButton variant="ghost" onClick={onEdit} disabled={loading}>
              {editLabel}
            </VdfButton>
          )}
          {onConfirm && (
            <VdfButton variant="primary" onClick={onConfirm} loading={loading}>
              {confirmLabel}{counting ? ` · ${remaining}` : ''}
            </VdfButton>
          )}
          {counting && (
            <button type="button" className={s.holdBtn} onClick={cancelAuto}>
              Hold — I want to change something
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

export default VdfApprovalCard;
