import { Suspense } from 'react';
import NewRun from '@/skills/gtm-pool/screens/NewRun';

/** /agents/gtm/pool/enrich — set up an enrichment run on a slice of the common pool. Admin only. */
export default function Page() {
  return <Suspense fallback={null}><NewRun /></Suspense>;
}
