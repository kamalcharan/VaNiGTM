'use client';

/**
 * useChannelTypes — master list of channel types (migration 226).
 *
 * Populates the compose surface's channel picker and the asset library's
 * filter row. Tenant-agnostic; the same set of codes reaches every tenant,
 * so cache it aggressively — the list changes at migration time, not
 * during a session.
 */

import { useSkillQuery } from './useSkill';

export interface ChannelType {
  id: number;
  code: string;
  name: string;
  kind: 'direct' | 'broadcast' | 'asset';
  sort_order: number;
}

export function useChannelTypes(kind?: ChannelType['kind']) {
  const res = useSkillQuery<{ channel_types: ChannelType[] }>(
    'channel-skill',
    'get_channel_types',
    kind ? { kind } : {},
    // Master data — safe to keep for a while.
    { staleTime: 15 * 60 * 1000 },
  );

  return {
    channelTypes: res.data?.data?.channel_types ?? [],
    isLoading: res.isLoading,
    error: res.error,
  };
}
