import { Suspense } from 'react';
import ImportsDashboard from '@/skills/gtm-imports/screens/ImportsDashboard';

/** /agents/gtm/imports — every import row by row, as a reference surface. */
export default function Page() {
  return <Suspense fallback={null}><ImportsDashboard /></Suspense>;
}
