import EnrichRun from '@/skills/gtm-pool/screens/EnrichRun';

/** /agents/gtm/pool/runs/<event id> — one enrichment run: live, then what it did. Admin only. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EnrichRun eventId={decodeURIComponent(id)} />;
}
