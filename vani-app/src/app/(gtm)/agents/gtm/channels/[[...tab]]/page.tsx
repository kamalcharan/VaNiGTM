import { notFound } from 'next/navigation';
import ChannelsFrame from '@/skills/gtm-channels/screens/ChannelsFrame';
import { CHANNEL_TABS, type ChannelTab } from '@/skills/gtm-channels/tabs';

/** /agents/gtm/channels[/cadence|/stories|/touches] — the four invisible pieces, read-only. */
export default async function Page({ params }: { params: Promise<{ tab?: string[] }> }) {
  const { tab } = await params;
  const id = (tab?.[0] ?? 'identity') as ChannelTab;
  if (!CHANNEL_TABS.some((t) => t.id === id)) notFound();
  return <ChannelsFrame tab={id} />;
}
