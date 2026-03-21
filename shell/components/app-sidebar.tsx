'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useShellConfig } from './shell-config-provider';

export function AppSidebar() {
  const pathname = usePathname();
  const config = useShellConfig();

  return (
    <nav style={{
      width: 240,
      minHeight: '100vh',
      background: 'var(--sidebar-bg, #f9fafb)',
      borderRight: '1px solid var(--border-color, #e5e7eb)',
      display: 'flex',
      flexDirection: 'column',
      padding: '1rem 0',
    }}>
      <div style={{
        padding: '0 1rem 0.25rem',
        fontWeight: 700,
        fontSize: '1rem',
        color: 'var(--text-primary, #111827)',
      }}>
        {config.product.name}
      </div>

      <div style={{
        padding: '0 1rem 1rem',
        fontSize: '0.7rem',
        color: 'var(--text-secondary, #9ca3af)',
      }}>
        {config.product.tagline}
      </div>

      <div style={{
        padding: '0 1rem',
        fontSize: '0.65rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-secondary, #9ca3af)',
        marginBottom: '0.5rem',
      }}>
        Views
      </div>

      {[...config.recipes]
        .sort((a, b) => a.priority - b.priority)
        .map((route) => {
          const isActive = pathname === route.path;
          const isDeferred = route.status === 'deferred';

          return (
            <Link
              key={route.recipe}
              href={route.path}
              style={{
                display: 'block',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                color: isActive
                  ? 'var(--accent-color, #2563eb)'
                  : isDeferred
                    ? 'var(--text-disabled, #d1d5db)'
                    : 'var(--text-primary, #374151)',
                background: isActive ? 'var(--accent-bg, #eff6ff)' : 'transparent',
                textDecoration: 'none',
                fontWeight: isActive ? 600 : 400,
                borderLeft: isActive ? '3px solid var(--accent-color, #2563eb)' : '3px solid transparent',
                cursor: isDeferred ? 'default' : 'pointer',
                pointerEvents: isDeferred ? 'none' : 'auto',
                opacity: isDeferred ? 0.5 : 1,
              }}
            >
              {route.title}
            </Link>
          );
        })}
    </nav>
  );
}
