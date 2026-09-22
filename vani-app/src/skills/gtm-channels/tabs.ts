export const CHANNEL_TABS = [
  { id: 'identity', label: 'Channels', href: '/agents/gtm/channels' },
  { id: 'cadence', label: 'Cadence', href: '/agents/gtm/channels/cadence' },
  { id: 'stories', label: 'Story library', href: '/agents/gtm/channels/stories' },
  { id: 'touches', label: 'Touch log', href: '/agents/gtm/channels/touches' },
] as const;
export type ChannelTab = (typeof CHANNEL_TABS)[number]['id'];
