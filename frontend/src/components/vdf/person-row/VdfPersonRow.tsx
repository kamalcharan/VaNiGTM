'use client';

import { type ReactNode } from 'react';
import s from './VdfPersonRow.module.css';

export interface VdfPersonRowProps {
  /** Initials shown in the avatar circle */
  avatarInitials: string;
  /** CSS gradient for the avatar background */
  avatarGradient: string;
  /** Primary name */
  name: string;
  /** Prefix (Mr, Mrs, etc.) — shown muted before the name */
  prefix?: string;
  /** Badges inline with the name: contact_no chip, client_no, ext-ref, etc. */
  nameBadges?: ReactNode;
  /** Secondary info line: phone, email, date added, etc. */
  subLine?: ReactNode;
  /**
   * Right-aligned slot: status badges, readiness ring, action buttons.
   * Rendered in a flex row with gap-8.
   */
  trailing?: ReactNode;
  /** Makes the whole row clickable */
  onClick?: () => void;
  /**
   * Accent highlight — use for bookmarked rows, featured records, etc.
   * Changes border + background to accent color tint.
   */
  highlighted?: boolean;
  className?: string;
}

/**
 * VdfPersonRow — generic card-row for person/entity list pages.
 *
 * Structure: [Avatar] [Info: name + subLine] [Trailing slot] [→ arrow]
 *
 * Used by: /contacts, /clients — and any future list pages.
 * Page CSS handles slot content (badges, buttons). This component only
 * owns the card container, avatar, info block, and trailing layout.
 */
export function VdfPersonRow({
  avatarInitials,
  avatarGradient,
  name,
  prefix,
  nameBadges,
  subLine,
  trailing,
  onClick,
  highlighted,
  className = '',
}: VdfPersonRowProps) {
  return (
    <div
      className={`${s.row} ${highlighted ? s.rowHighlighted : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      } : undefined}
    >
      {/* ── Avatar ── */}
      <div className={s.avatar} style={{ background: avatarGradient }}>
        {avatarInitials}
      </div>

      {/* ── Info block ── */}
      <div className={s.info}>
        <div className={s.nameRow}>
          {prefix && <span className={s.prefix}>{prefix}</span>}
          <span className={s.name}>{name}</span>
          {nameBadges}
        </div>
        {subLine && <div className={s.subLine}>{subLine}</div>}
      </div>

      {/* ── Trailing slot ── */}
      {trailing && <div className={s.trailing}>{trailing}</div>}

      {/* ── Nav arrow (hover-reveal) ── */}
      {onClick && <span className={s.arrow} aria-hidden="true">→</span>}
    </div>
  );
}
