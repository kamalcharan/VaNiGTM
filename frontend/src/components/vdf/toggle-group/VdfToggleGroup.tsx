'use client';

import s from './VdfToggleGroup.module.css';

export type ToggleColor = 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface VdfToggleOption {
  id: string;
  label: string;
  /** Color applied when this option is active */
  activeColor?: ToggleColor;
}

export interface VdfToggleGroupProps {
  options: VdfToggleOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * VdfToggleGroup — segmented button group (e.g. Active / Inactive filter).
 *
 * Each option can specify its own activeColor, so "Active" can be success-green
 * while "Inactive" can be warning-amber.
 *
 * Usage:
 * ```tsx
 * <VdfToggleGroup
 *   options={[
 *     { id: 'active',   label: 'Active',   activeColor: 'success' },
 *     { id: 'inactive', label: 'Inactive', activeColor: 'warning' },
 *   ]}
 *   value={status}
 *   onChange={v => setStatus(v as StatusMode)}
 * />
 * ```
 */
export function VdfToggleGroup({ options, value, onChange, className }: VdfToggleGroupProps) {
  return (
    <div className={`${s.group} ${className ?? ''}`} role="group">
      {options.map(opt => {
        const isActive = opt.id === value;
        const colorCls = isActive && opt.activeColor ? s[`active_${opt.activeColor}`] : '';
        return (
          <button
            key={opt.id}
            type="button"
            className={`${s.pill} ${isActive ? (colorCls || s.active_primary) : ''}`}
            onClick={() => onChange(opt.id)}
            aria-pressed={isActive}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default VdfToggleGroup;
