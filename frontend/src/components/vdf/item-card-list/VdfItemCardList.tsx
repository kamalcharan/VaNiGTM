'use client';

/**
 * VdfItemCardList — schema-driven list of editable rows.
 *
 * Used for assets, liabilities, and goals in the MFD snapshot form.
 * Each row renders as a bordered card with a numbered header, a
 * configurable field grid, and a remove button.
 *
 * The caller controls the list state (fully controlled):
 *   const [items, setItems] = useState<ItemRow[]>([]);
 *   <VdfItemCardList schema={ASSET_SCHEMA} value={items} onChange={setItems}
 *                    prefix="ASSET" addLabel="+ Add asset" />
 *
 * Field types supported per row:
 *   'text'      — plain text input
 *   'currency'  — ₹ prefixed number input (VdfCurrencyInput)
 *   'liquidity' — liquid / illiquid two-button toggle (VdfLiquidityToggle)
 *   'pills'     — horizontal pill multi-choice (single select)
 *   'select'    — native <select> dropdown
 */

import { useCallback, useId } from 'react';
import { VdfCurrencyInput } from '../currency-input/VdfCurrencyInput';
import { VdfLiquidityToggle } from '../liquidity-toggle/VdfLiquidityToggle';
import s from './VdfItemCardList.module.css';

/* ── Field schema types ─────────────────────────────────── */

export type ItemFieldText = {
  type: 'text';
  key: string;
  label: string;
  placeholder?: string;
};

export type ItemFieldCurrency = {
  type: 'currency';
  key: string;
  label: string;
  /** Right-side suffix on the currency input, e.g. "/mo", "p.a." */
  suffix?: string;
};

export type ItemFieldLiquidity = {
  type: 'liquidity';
  key: string;
  label: string;
};

export type ItemFieldPills = {
  type: 'pills';
  key: string;
  label: string;
  options: string[];
};

export type ItemFieldSelect = {
  type: 'select';
  key: string;
  label: string;
  options: { value: string; label: string }[];
};

export type ItemFieldDef =
  | ItemFieldText
  | ItemFieldCurrency
  | ItemFieldLiquidity
  | ItemFieldPills
  | ItemFieldSelect;

/* ── Row type ───────────────────────────────────────────── */

/** A single data row. _id is internal — do not display. */
export type ItemRow = { _id: string } & Record<string, unknown>;

/* ── Props ──────────────────────────────────────────────── */

export interface VdfItemCardListProps {
  /** Column definitions — order determines render order. */
  schema: ItemFieldDef[];
  /** Controlled list of rows. */
  value: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  /** Number of field columns inside each card row. Default: 3 */
  columns?: 2 | 3 | 4;
  /** Uppercase prefix for item labels, e.g. "ASSET" → "ASSET_01". Default: "ITEM" */
  prefix?: string;
  /** Add-row button label. Default: "+ Add item" */
  addLabel?: string;
  /** Maximum rows allowed — hides Add button when reached. */
  maxItems?: number;
  className?: string;
}

/* ── Helpers ────────────────────────────────────────────── */

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultForField(field: ItemFieldDef): unknown {
  switch (field.type) {
    case 'text':      return '';
    case 'currency':  return '';
    case 'liquidity': return true;           // liquid by default
    case 'pills':     return field.options[0] ?? '';
    case 'select':    return field.options[0]?.value ?? '';
  }
}

function makeNewRow(schema: ItemFieldDef[]): ItemRow {
  const row: ItemRow = { _id: genId() };
  for (const field of schema) {
    row[field.key] = defaultForField(field);
  }
  return row;
}

/* ── Component ──────────────────────────────────────────── */

export function VdfItemCardList({
  schema,
  value,
  onChange,
  columns = 3,
  prefix = 'ITEM',
  addLabel = '+ Add item',
  maxItems,
  className,
}: VdfItemCardListProps) {
  const updateRow = useCallback(
    (idx: number, key: string, val: unknown) => {
      onChange(value.map((row, i) => (i === idx ? { ...row, [key]: val } : row)));
    },
    [value, onChange],
  );

  const removeRow = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange],
  );

  const addRow = useCallback(() => {
    onChange([...value, makeNewRow(schema)]);
  }, [value, onChange, schema]);

  const canAdd = maxItems == null || value.length < maxItems;

  return (
    <div className={`${s.list} ${className || ''}`}>
      {value.map((row, idx) => (
        <div key={row._id} className={s.card}>
          {/* ── Card header: item number + remove ─────────────── */}
          <div className={s.head}>
            <span className={s.num}>
              {prefix}_{String(idx + 1).padStart(2, '0')}
            </span>
            <button
              className={s.remove}
              onClick={() => removeRow(idx)}
              type="button"
              aria-label={`Remove ${prefix.toLowerCase()} ${idx + 1}`}
            >
              ✕
            </button>
          </div>

          {/* ── Field grid ────────────────────────────────────── */}
          <div className={`${s.fields} ${s[`cols${columns}`]}`}>
            {schema.map((field) => (
              <FieldCell
                key={field.key}
                field={field}
                value={row[field.key]}
                onChange={(val) => updateRow(idx, field.key, val)}
              />
            ))}
          </div>
        </div>
      ))}

      {canAdd && (
        <button className={s.addBtn} onClick={addRow} type="button">
          {addLabel}
        </button>
      )}
    </div>
  );
}

/* ── FieldCell ──────────────────────────────────────────── */

interface FieldCellProps {
  field: ItemFieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
}

function FieldCell({ field, value, onChange }: FieldCellProps) {
  const uid = useId();

  if (field.type === 'currency') {
    return (
      <VdfCurrencyInput
        label={field.label}
        value={String(value ?? '')}
        onChange={(val) => onChange(val)}
        suffix={field.suffix}
        compact
        className={s.noMargin}
      />
    );
  }

  if (field.type === 'liquidity') {
    return (
      <div className={s.fieldWrap}>
        <span className={s.fieldLabel}>{field.label}</span>
        <VdfLiquidityToggle
          value={value !== false && value !== 'illiquid'}
          onChange={(isLiquid) => onChange(isLiquid)}
        />
      </div>
    );
  }

  if (field.type === 'pills') {
    const active = String(value ?? field.options[0] ?? '');
    return (
      <div className={s.fieldWrap}>
        <span className={s.fieldLabel}>{field.label}</span>
        <div className={s.pills}>
          {field.options.map((opt) => (
            <button
              key={opt}
              className={`${s.pill} ${active === opt ? s.pillActive : ''}`}
              onClick={() => onChange(opt)}
              type="button"
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className={s.fieldWrap}>
        <label className={s.fieldLabel} htmlFor={uid}>
          {field.label}
        </label>
        <select
          id={uid}
          className={s.select}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // 'text'
  return (
    <div className={s.fieldWrap}>
      <label className={s.fieldLabel} htmlFor={uid}>
        {field.label}
      </label>
      <input
        id={uid}
        className={s.input}
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={(field as ItemFieldText).placeholder}
      />
    </div>
  );
}
