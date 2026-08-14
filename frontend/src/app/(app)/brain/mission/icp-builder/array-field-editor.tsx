'use client';

import s from './icp-builder-page.module.css';

/**
 * Simplest reasonable editor for a flat string[] field (key_differentiators,
 * primary_pain_points, active_channels) — one text input per item, add/remove
 * affordances. Deliberately not a tag/chip input: no drag-reorder, no
 * autocomplete. Local to this route, not a VDF component.
 */
export interface ArrayFieldEditorProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function ArrayFieldEditor({ values, onChange, placeholder }: ArrayFieldEditorProps) {
  function updateRow(index: number, value: string) {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...values, '']);
  }

  return (
    <div className={s.arrayList}>
      {values.map((value, index) => (
        <div key={index} className={s.arrayRow}>
          <input
            className={s.arrayInput}
            value={value}
            placeholder={placeholder}
            onChange={(e) => updateRow(index, e.target.value)}
          />
          <button
            type="button"
            className={s.arrayRemove}
            onClick={() => removeRow(index)}
            aria-label="Remove item"
          >
            {'×'}
          </button>
        </div>
      ))}
      <button type="button" className={s.arrayAdd} onClick={addRow}>
        + Add
      </button>
    </div>
  );
}
