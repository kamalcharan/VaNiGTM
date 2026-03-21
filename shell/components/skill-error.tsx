/**
 * KI-32: Error state component for recipe pages.
 */

'use client';

export function SkillError({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="skill-error" style={{
      padding: '2rem',
      margin: '1rem',
      borderRadius: '0.5rem',
      background: 'var(--error-bg, #fef2f2)',
      border: '1px solid var(--error-border, #fecaca)',
      color: 'var(--error-text, #991b1b)',
    }}>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Something went wrong</p>
      <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.85 }}>{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--error-border, #fecaca)',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
