'use client';

import { useRef } from 'react';
import s from './VdfColorPicker.module.css';

/* ── Curated palette — 36 colours, 6 hue groups × 6 ──── */
const PALETTE: { label: string; colors: string[] }[] = [
  {
    label: 'Reds & Pinks',
    colors: ['#B71C1C', '#E53935', '#D47070', '#C2185B', '#E91E8C', '#F48FB1'],
  },
  {
    label: 'Oranges & Ambers',
    colors: ['#E65100', '#FB8C00', '#E67E22', '#C9A84C', '#F9A825', '#FDD835'],
  },
  {
    label: 'Greens & Teals',
    colors: ['#1B5E20', '#388E3C', '#27AE60', '#3BAFA7', '#00897B', '#4ECDC4'],
  },
  {
    label: 'Blues',
    colors: ['#0D47A1', '#1565C0', '#2980B9', '#4A8FD4', '#5EAAF0', '#29B6F6'],
  },
  {
    label: 'Purples',
    colors: ['#4A148C', '#7B1FA2', '#8E44AD', '#7A6FD4', '#9B8FE8', '#CE93D8'],
  },
  {
    label: 'Neutrals & Darks',
    colors: ['#1C2833', '#2C3E50', '#34495E', '#5D6D7E', '#78909C', '#90A4AE'],
  },
];

export interface VdfColorPickerProps {
  /** Current hex color value e.g. "#C9A84C" */
  value: string;
  /** Called with new hex string when color changes (edit mode only) */
  onChange?: (color: string) => void;
  /** Read-only display: shows swatch + hex value, no controls */
  readOnly?: boolean;
  /** Disable the picker controls */
  disabled?: boolean;
}

export function VdfColorPicker({
  value,
  onChange,
  readOnly = false,
  disabled = false,
}: VdfColorPickerProps) {
  const nativeRef = useRef<HTMLInputElement>(null);

  function handleHex(e: React.ChangeEvent<HTMLInputElement>) {
    if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
      onChange?.(e.target.value);
    }
  }

  const displayColor = value || '#888888';

  if (readOnly) {
    return (
      <div className={s.displayRow}>
        <div className={s.displaySwatch} style={{ background: displayColor }} />
        <span className={s.displayHex}>{value || '—'}</span>
      </div>
    );
  }

  return (
    <>
      {/* ── Active colour row ── */}
      <div className={s.pickerMain}>
        <div className={s.pickerSwatch} style={{ background: displayColor }} />
        <input
          type="text"
          className={s.hexInput}
          value={value}
          onChange={handleHex}
          maxLength={7}
          disabled={disabled}
          placeholder="#C9A84C"
          spellCheck={false}
        />
        {/* Hidden native picker — opened by the Browse button below */}
        <input
          ref={nativeRef}
          type="color"
          className={s.nativeHidden}
          value={displayColor}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
        />
        <button
          type="button"
          className={s.browseBtn}
          onClick={() => nativeRef.current?.click()}
          disabled={disabled}
          title="Open full colour picker"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="14" height="14">
            <circle cx="10" cy="10" r="8" />
            <path d="M10 2a8 8 0 0 1 8 8" strokeLinecap="round" />
            <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none" />
          </svg>
          Browse
        </button>
      </div>

      {/* ── Palette grid ── */}
      <div className={s.palette}>
        {PALETTE.map((group) => (
          <div key={group.label} className={s.paletteGroup}>
            <span className={s.groupLabel}>{group.label}</span>
            <div className={s.groupRow}>
              {group.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${s.dot} ${value === c ? s.dotActive : ''}`}
                  style={{ background: c }}
                  onClick={() => onChange?.(c)}
                  disabled={disabled}
                  title={c}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
