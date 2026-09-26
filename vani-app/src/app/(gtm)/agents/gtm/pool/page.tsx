import { Suspense } from 'react';
import CommonPool from '@/skills/gtm-pool/screens/CommonPool';

/** /agents/gtm/pool — the shared directory data, admin tenants only. */
export default function Page() {
  return <Suspense fallback={null}><CommonPool /></Suspense>;
}
