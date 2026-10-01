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
 *
 * NOTHING IS EMAILED (Charan, 2026-10-01). An invite returns a one-time token;
 * the console turns it into a /join link the inviter copies and shares. Only
 * the token's hash is stored, so a link cannot be shown again later — "New
 * link" re-invites the address, which renews the token and kills the old one.
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
  /** From /auth/team (vn_roles.code / name). */
  role_code?: string | null;
  role_name?: string | null;
}

export interface PendingInvitation {
  id: string;
  email: string;
  status: string;
  expires_at: string | null;
  /** The role it was made with, so "New link" keeps it. */
  role_code?: string | null;
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
      const team = await apiFetch<{ members?: TeamMember[] }>(API.auth.team);
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
        data: { members: team?.members ?? [], pending },
      };
    },
  });
}

/**
 * Roles the invite endpoint resolves against vn_roles. Registration seeds
 * owner, admin and planner per workspace; 'member' was listed here and never
 * existed, so choosing it answered "Role not found".
 */
export const INVITE_ROLES = [
  { id: 'planner', label: 'Planner' },
  { id: 'admin', label: 'Admin' },
] as const;

/** One row of POST /auth/invite. `token` is present only when a link was made. */
export interface InviteRow {
  email: string;
  status: 'created' | 'renewed' | 'error';
  message?: string;
  token?: string;
  expires_at?: string;
}

/** The link a person opens to join. Built from where the console is running — no configured host. */
export function joinLink(token: string): string {
  return `${window.location.origin}/join/${token}`;
}

export function useInvite() {
  const qc = useQueryClient();
  const m = useSkillMutation<{ invitations: InviteRow[] }>(
    'auth',
    'invite',
    { errorMessage: 'Could not create the invitation link.' },
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
