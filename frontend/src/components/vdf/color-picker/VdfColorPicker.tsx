'use client';

import s from './VdfColorPicker.module.css';

const DEFAULT_QUICK_COLORS = [
  '#C9A84C', '#4A8FD4', '#3BAFA7', '#D47070', '#7A6FD4',
  '#E8B44C', '#5EAAF0', '#4ECDC4', '#E88B8B', '#9B8FE8',
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
  /** Quick-select color swatches. Defaults to 10 preset brand colors */
  quickColors?: string[];
}

export function VdfColorPicker({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  quickColors = DEFAULT_QUICK_COLORS,
}: VdfColorPickerProps) {

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
        <input
          type="color"
          className={s.nativePicker}
          value={displayColor}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          title="Pick color"
        />
      </div>

      <div className={s.quickColors}>
        <span className={s.quickLabel}>Quick Colors</span>
        <div className={s.quickRow}>
          {quickColors.map((c) => (
            <button
              key={c}
              type="button"
              className={`${s.quickDot} ${value === c ? s.quickDotActive : ''}`}
              style={{ background: c }}
              onClick={() => onChange?.(c)}
              disabled={disabled}
              title={c}
            />
          ))}
        </div>
      </div>
    </>
  );
}
