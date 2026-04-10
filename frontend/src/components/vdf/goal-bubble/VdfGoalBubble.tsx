'use client';

/**
 * VdfGoalBubble — emoji pill selector for financial goal types.
 *
 * Used in the Goals section of the snapshot form. Renders as a
 * compact pill with an emoji icon and label. Selected state fills
 * with the foreground colour (ink/dark).
 *
 * Usage:
 *   <VdfGoalBubble icon="🏠" label="House" isSelected={type==='house'} onClick={() => setType('house')} />
 */

import s from './VdfGoalBubble.module.css';

export interface VdfGoalBubbleProps {
  /** Emoji representing the goal type */
  icon: string;
  /** Short display label */
  label: string;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function VdfGoalBubble({
  icon,
  label,
  isSelected,
  onClick,
  disabled = false,
  className,
}: VdfGoalBubbleProps) {
  return (
    <button
      type="button"
      className={`${s.bubble} ${isSelected ? s.selected : ''} ${disabled ? s.disabled : ''} ${className || ''}`}
      onClick={() => !disabled && onClick()}
      aria-pressed={isSelected}
      disabled={disabled}
    >
      <span className={s.icon} aria-hidden>{icon}</span>
      <span className={s.label}>{label}</span>
    </button>
  );
}

export default VdfGoalBubble;
