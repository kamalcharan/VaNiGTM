import s from './VdfEnrichmentWaterfall.module.css';

export interface VdfEnrichmentProvider {
  name: string;
  state: 'hit' | 'miss' | 'pending' | 'idle';
  /** What the hit produced — e.g. the found email */
  detail?: string;
}

export interface VdfEnrichmentWaterfallProps {
  providers: VdfEnrichmentProvider[];
  /** Label shown when every provider missed */
  emptyLabel?: string;
  className?: string;
}

/**
 * VdfEnrichmentWaterfall — provider chips tried in sequence with
 * hit/miss states and a graceful all-miss ending (ux-references
 * pattern 5). This is the UI contract for the universal connector:
 * each chip is one provider attempt; the first hit ends the chain.
 */
export function VdfEnrichmentWaterfall({
  providers,
  emptyLabel = 'No email found',
  className,
}: VdfEnrichmentWaterfallProps) {
  const settled = providers.every((p) => p.state === 'hit' || p.state === 'miss');
  const allMissed = settled && providers.length > 0 && providers.every((p) => p.state === 'miss');

  return (
    <div className={`${s.waterfall} ${className || ''}`}>
      {providers.map((p, i) => (
        <span key={p.name} className={s.stage}>
          {i > 0 && <span className={s.arrow} aria-hidden>→</span>}
          <span className={`${s.chip} ${s[p.state]}`}>
            {p.state === 'hit' && <span className={s.mark} aria-hidden>✓</span>}
            {p.state === 'miss' && <span className={s.mark} aria-hidden>✕</span>}
            {p.state === 'pending' && <span className={`${s.mark} ${s.spinner}`} aria-hidden />}
            <span className={s.chipName}>{p.name}</span>
            {p.state === 'hit' && p.detail && <span className={s.detail}>{p.detail}</span>}
          </span>
        </span>
      ))}

      {allMissed && (
        <span className={s.stage}>
          <span className={s.arrow} aria-hidden>→</span>
          <span className={`${s.chip} ${s.empty}`}>{emptyLabel}</span>
        </span>
      )}
    </div>
  );
}

export default VdfEnrichmentWaterfall;
