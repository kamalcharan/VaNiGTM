import s from './VdfVisibilityMatrix.module.css';

export type VdfVisibilityCell = 'strong' | 'partial' | 'absent';

export interface VdfVisibilityRow {
  label: string;
  cells: VdfVisibilityCell[];
}

export interface VdfVisibilityMatrixProps {
  /** Column headers — e.g. AI answer engines */
  columns: string[];
  rows: VdfVisibilityRow[];
  className?: string;
}

const CELL_LABEL: Record<VdfVisibilityCell, string> = {
  strong: 'Cited',
  partial: 'Mentioned',
  absent: 'Absent',
};

const CELL_GLYPH: Record<VdfVisibilityCell, string> = {
  strong: '●',
  partial: '◐',
  absent: '○',
};

/**
 * VdfVisibilityMatrix — AEO visibility grid (POA 1.3 gap component):
 * target queries × answer engines, each cell = how visible the tenant is.
 * State is never color-alone: each cell pairs a distinct glyph (●/◐/○)
 * with its status color, and the title carries the text label.
 */
export function VdfVisibilityMatrix({ columns, rows, className }: VdfVisibilityMatrixProps) {
  return (
    <div className={`${s.wrap} ${className || ''}`}>
      <table className={s.matrix}>
        <thead>
          <tr>
            <th className={s.rowHead} scope="col">Query</th>
            {columns.map((c) => <th key={c} scope="col">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th className={s.rowHead} scope="row">{row.label}</th>
              {row.cells.map((cell, i) => (
                <td key={i}>
                  <span
                    className={`${s.cell} ${s[cell]}`}
                    title={`${row.label} · ${columns[i]}: ${CELL_LABEL[cell]}`}
                  >
                    <span aria-hidden>{CELL_GLYPH[cell]}</span>
                    <span className={s.srOnly}>{CELL_LABEL[cell]}</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className={s.legend}>
        {(Object.keys(CELL_LABEL) as VdfVisibilityCell[]).map((k) => (
          <span key={k} className={s.legendItem}>
            <span className={`${s.cell} ${s[k]} ${s.legendCell}`} aria-hidden>{CELL_GLYPH[k]}</span>
            {CELL_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default VdfVisibilityMatrix;
