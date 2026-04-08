'use client';

/**
 * App shell error boundary — catches React render errors within (app)/* routes.
 * Renders inside the app layout so the sidebar remains visible.
 * Next.js requires this to be a Client Component with `reset` prop.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VdfErrorScreen } from '@/components/vdf';
import s from './error.module.css';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to console in dev; in production wire to error logging (ki_error_log)
    console.error('[AppError boundary]', error);
  }, [error]);

  const router = useRouter();

  return (
    <VdfErrorScreen
      code="500"
      icon="⚠️"
      title="Something went wrong"
      description={
        process.env.NODE_ENV === 'development'
          ? error.message
          : "An unexpected error occurred. Our team has been notified."
      }
      action={
        <div className={s.actions}>
          <button className={s.retryBtn} onClick={reset}>
            Try again
          </button>
          <button className={s.homeBtn} onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </button>
        </div>
      }
    />
  );
}
