import RunDetail from '@/skills/runs/screens/RunDetail';

/** /runs/128 — one run in full. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetail runId={decodeURIComponent(id)} />;
}
