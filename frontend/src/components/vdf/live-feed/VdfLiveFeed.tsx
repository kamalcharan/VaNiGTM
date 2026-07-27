import s from './VdfLiveFeed.module.css';

export type VdfLiveFeedKind = 'action' | 'success' | 'warn' | 'error' | 'info';

export interface VdfLiveFeedItem {
  id: string;
  /** Short mono timestamp — e.g. "14:02:11" */
  time: string;
  /** Which agent emitted it — e.g. "Sequence" */
  agent: string;
  message: string;
  kind: VdfLiveFeedKind;
}

export interface VdfLiveFeedProps {
  items: VdfLiveFeedItem[];
  /** Show the pulsing LIVE header chip */
  live?: boolean;
  className?: string;
}

/**
 * VdfLiveFeed — the war-room operational stream (POA 1.3 gap component).
 * Newest first; each entry = timestamp, agent chip, message, and a
 * kind-colored marker. Status colors are reserved for status
 * (success/warn/error); routine actions use the primary tone.
 */
export function VdfLiveFeed({ items, live = true, className }: VdfLiveFeedProps) {
  return (
    <div className={`${s.feed} ${className || ''}`}>
      <div className={s.head}>
        <span className={s.headLabel}>Live feed</span>
        {live && (
          <span className={s.liveChip}>
            <span className={s.liveDot} aria-hidden />
            LIVE
          </span>
        )}
      </div>

      <ol className={s.list}>
        {items.map((item, i) => (
          <li key={item.id} className={s.item} style={{ animationDelay: `${i * 0.06}s` }}>
            <span className={`${s.marker} ${s[item.kind]}`} aria-hidden />
            <span className={s.time}>{item.time}</span>
            <span className={s.agent}>{item.agent}</span>
            <span className={s.message}>{item.message}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default VdfLiveFeed;
