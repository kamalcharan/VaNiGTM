'use client';

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
  className,
}: VdfApprovalCardProps) {
  const confirmed = status === 'confirmed';

  return (
    <section className={`${s.card} ${confirmed ? s.confirmed : ''} ${className || ''}`}>
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
              {confirmLabel}
            </VdfButton>
          )}
        </footer>
      )}
    </section>
  );
}

export default VdfApprovalCard;
