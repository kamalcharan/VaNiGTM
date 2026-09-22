import { Suspense } from 'react';
import AudiencePathway from '@/skills/gtm-audience/screens/AudiencePathway';

/** /agents/gtm/audience — G1, Build the audience. `?step=` reopens a finished step. */
export default function Page() {
  // useSearchParams needs a Suspense boundary at build time.
  return <Suspense fallback={null}><AudiencePathway /></Suspense>;
}
