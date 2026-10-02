import { Suspense } from 'react';
import IndustryMaster from '@/skills/gtm-pool/screens/IndustryMaster';

/** /agents/gtm/pool/industries — the one industry master, with pool counts. Admin only. */
export default function Page() {
  return <Suspense fallback={null}><IndustryMaster /></Suspense>;
}
