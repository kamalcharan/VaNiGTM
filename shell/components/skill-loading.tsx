/**
 * KI-32: Loading state component for recipe pages.
 */

'use client';

export function SkillLoading({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="skill-loading" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3rem',
      color: 'var(--text-secondary, #6b7280)',
      fontSize: '0.95rem',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div className="skill-loading-spinner" style={{
          width: '2rem',
          height: '2rem',
          border: '3px solid var(--border-color, #e5e7eb)',
          borderTopColor: 'var(--primary, #3b82f6)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 0.75rem',
        }} />
        <p>{message}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
