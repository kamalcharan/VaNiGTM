'use client';

/**
 * People — step 7 of the Smart Profile.
 *
 * Reads and writes the EXISTING vn_ spine: `/auth/team` lists vn_users,
 * `/auth/invite` writes vn_invitations. No vani_ table is involved, which is
 * why this step could be finished while Domain could not — vani_membership
 * references vani_user, a spine whose presence is unconfirmed.
 *
 * The invite write goes through useSkillMutation for the double-submit guard
 * and the idempotency key. Note the standing caveat from CLAUDE.md: VaNiGTM
 * does not honour Idempotency-Key on any endpoint yet, so the key is sent but
 * not replayed. Do not tell a user this is safe to retry, and do not auto-retry.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import type { SkillResult } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  role?: string | null;
}

export interface PendingInvitation {
  id: string;
  email: string;
  status: string;
  expires_at: string | null;
}

export interface People {
  members: TeamMember[];
  pending: PendingInvitation[];
}

export function usePeople(): UseQueryResult<SkillResult<People>, Error> {
  return useQuery<SkillResult<People>, Error>({
    queryKey: ['smart-profile', 'people'],
    queryFn: async () => {
      // Two reads, one section. Invitations are optional: an older backend
      // without the route must not blank the team list beside it.
      const team = await apiFetch<{ users?: TeamMember[]; team?: TeamMember[] }>(API.auth.team);
      let pending: PendingInvitation[] = [];
      try {
        const inv = await apiFetch<{ invitations?: PendingInvitation[] }>(API.auth.invitations);
        pending = (inv?.invitations ?? []).filter((i) => i.status === 'pending');
      } catch {
        /* optional */
      }
      return {
        success: true,
        skill: 'smart-profile',
        function: 'people',
        data: { members: team?.users ?? team?.team ?? [], pending },
      };
    },
  });
}

/** Roles the invite endpoint resolves against vn_roles. */
export const INVITE_ROLES = [
  { id: 'planner', label: 'Planner' },
  { id: 'admin', label: 'Admin' },
  { id: 'member', label: 'Member' },
] as const;

export function useInvite() {
  const qc = useQueryClient();
  const m = useSkillMutation<{ invitations: { email: string; status: string; message?: string }[] }>(
    'auth',
    'invite',
    { errorMessage: 'Could not send the invitation.' },
  );

  const invite = useCallback(
    async (email: string, roleId: string) => {
      const result = await m.mutate({ invitations: [{ email, role_id: roleId }] });
      if (!result) return null;
      await qc.invalidateQueries({ queryKey: ['smart-profile', 'people'] });
      return result;
    },
    [m, qc],
  );

  return { invite, isSending: m.isPending };
}
