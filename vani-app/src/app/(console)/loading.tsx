/**
 * Route-level fallback for every console screen. Next renders this while the
 * segment's own code and data are on the way, so no console route can ship
 * without a loading state — it is structural, not per-page discipline.
 */
import { PageSkeleton } from '@/platform/feedback';

export default function ConsoleLoading() {
  return <PageSkeleton label="Loading page" />;
}
