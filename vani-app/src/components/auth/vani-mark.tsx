/**
 * The VaNi mark — a core with three orbiting nodes, the same geometry the
 * marketing site uses. Gold, always: orange is the action, gold identifies VaNi.
 */
export default function VaniMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="3.2" fill="var(--gold)" />
      <circle cx="16" cy="5.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
      <circle cx="25" cy="21.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
      <circle cx="7" cy="21.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
      <line x1="16" y1="8" x2="16" y2="12.8" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.6" />
      <line x1="23" y1="19.8" x2="18.9" y2="17.6" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.6" />
      <line x1="9" y1="19.8" x2="13.1" y2="17.6" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.6" />
      <circle cx="16" cy="16" r="12.5" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.22" />
    </svg>
  );
}
