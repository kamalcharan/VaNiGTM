import s from './VdfPipelineKanban.module.css';

export interface VdfKanbanCard {
  id: string;
  title: string;
  sub?: string;
  /** Small chips on the card — e.g. campaign, score */
  meta?: string[];
}

export interface VdfKanbanColumn {
  id: string;
  title: string;
  cards: VdfKanbanCard[];
  /** Marks the terminal/won column with the success tone */
  accent?: 'default' | 'success';
}

export interface VdfPipelineKanbanProps {
  columns: VdfKanbanColumn[];
  className?: string;
}

/**
 * VdfPipelineKanban — the prospect pipeline board (POA 1.3 gap
 * component). Columns are stages; cards are prospects with operational
 * chips. Horizontal scroll container; column headers carry live counts.
 */
export function VdfPipelineKanban({ columns, className }: VdfPipelineKanbanProps) {
  return (
    <div className={`${s.board} ${className || ''}`}>
      {columns.map((col) => (
        <section key={col.id} className={s.column}>
          <header className={s.colHead}>
            <span className={`${s.colTitle} ${col.accent === 'success' ? s.colTitleSuccess : ''}`}>
              {col.title}
            </span>
            <span className={s.colCount}>{col.cards.length}</span>
          </header>

          <div className={s.cards}>
            {col.cards.map((card) => (
              <article key={card.id} className={s.card}>
                <span className={s.cardTitle}>{card.title}</span>
                {card.sub && <span className={s.cardSub}>{card.sub}</span>}
                {card.meta && card.meta.length > 0 && (
                  <div className={s.metaRow}>
                    {card.meta.map((m) => <span key={m} className={s.metaChip}>{m}</span>)}
                  </div>
                )}
              </article>
            ))}
            {col.cards.length === 0 && <div className={s.emptyCol}>—</div>}
          </div>
        </section>
      ))}
    </div>
  );
}

export default VdfPipelineKanban;
