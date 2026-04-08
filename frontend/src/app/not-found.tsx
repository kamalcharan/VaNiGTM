/**
 * 404 — Not Found
 *
 * Standalone full-screen page (no sidebar). Rendered by Next.js for any
 * URL that doesn't match a route, and for `notFound()` calls in Server Components.
 */

import Link from 'next/link';
import { VdfErrorScreen } from '@/components/vdf';
import s from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={s.page}>
      <VdfErrorScreen
        code="404"
        icon="🔍"
        title="Page Not Found"
        description="The page you're looking for doesn't exist or has been moved."
        action={
          <Link href="/dashboard" className={s.homeLink}>
            Go to Dashboard
          </Link>
        }
      />
    </div>
  );
}
