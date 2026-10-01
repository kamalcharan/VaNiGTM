import { Suspense } from 'react';
import CompaniesList from '@/skills/gtm-companies/screens/CompaniesList';

/** /agents/gtm/companies — every company the tenant holds, as a reference surface. */
export default function Page() {
  return <Suspense fallback={null}><CompaniesList /></Suspense>;
}
