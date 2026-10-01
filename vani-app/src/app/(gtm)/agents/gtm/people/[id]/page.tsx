import PersonDetail from '@/skills/gtm-people/screens/PersonDetail';

/** /agents/gtm/people/CONT-0001 — one person. The id in the URL is the tenant-facing one. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonDetail id={decodeURIComponent(id)} />;
}
