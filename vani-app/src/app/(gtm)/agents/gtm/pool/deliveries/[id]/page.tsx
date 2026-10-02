import DeliveryRows from '@/skills/gtm-pool/screens/DeliveryRows';

/** /agents/gtm/pool/deliveries/12 — one common-pool delivery's companies by state. Admin only. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeliveryRows loadId={decodeURIComponent(id)} />;
}
