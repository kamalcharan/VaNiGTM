import CompanyDetail from '@/skills/gtm-companies/screens/CompanyDetail';

/** /agents/gtm/companies/PROS-0042 — one company in full. The ref in the URL is the tenant-facing one. */
export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return <CompanyDetail refId={decodeURIComponent(ref)} />;
}
