'use client';

/**
 * Reads for the Smart Profile view.
 *
 * Four plain REST endpoints — the same ones the build flow writes through. Each
 * is wrapped in the transport's `{ success, data }` envelope so `<DataBoundary>`
 * works unchanged and the five states come from the helper rather than five
 * hand-rolled `if`s per section.
 *
 * A 404 resolves to success with an undefined payload, NOT an error: "this part
 * has not been built yet" is an EMPTY state. Rendering it as a failure would
 * tell someone their profile is broken when it is merely unstarted — the exact
 * distinction the boundary exists to keep.
 *
 * Shapes are duplicated from the build screen rather than imported from it.
 * That file is a verbatim port VaNiGTM keeps editing; exporting types out of it
 * would turn every upstream edit into a conflict.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { API, type ServiceEndpoint } from '@/lib/serviceURLs';
import type { SkillResult } from '@/lib/useSkill';

export interface GtmProfile {
  product_name: string | null;
  product_description: string | null;
  product_tagline: string | null;
  core_problem: string | null;
  key_differentiators: string[] | null;
  icp_role: string | null;
  icp_company_type: string | null;
  icp_industry: string | null;
  primary_pain_points: string[] | null;
  completion_score: number;
  approved_at: string | null;
}

export interface SemanticCluster {
  id: string;
  primary_term: string;
  related_terms: string[];
  cluster_type: string;
  approved_at: string | null;
}

export interface Competitor {
  id: string;
  name: string;
  description: string | null;
  properties: Record<string, unknown>;
}

export interface TenantBrand {
  voice_tone: string[] | null;
  always_say: string[] | null;
  never_say: string[] | null;
  visual: {
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    typography?: string;
  };
  proof: string[] | null;
  approved_at: string | null;
}

function useWrappedRead<T>(
  key: string,
  endpoint: ServiceEndpoint,
  pick: (raw: any) => T,
): UseQueryResult<SkillResult<T>, Error> {
  return useQuery<SkillResult<T>, Error>({
    queryKey: ['smart-profile', key],
    queryFn: async () => {
      try {
        const raw = await apiFetch<any>(endpoint);
        return { success: true, skill: 'smart-profile', function: key, data: pick(raw) };
      } catch (err: any) {
        if (err?.status === 404 || err?.code === 'PROFILE_NOT_FOUND') {
          return { success: true, skill: 'smart-profile', function: key, data: pick({}) };
        }
        throw err;
      }
    },
  });
}

export const useProfileRead = () =>
  useWrappedRead<GtmProfile | undefined>('profile', API.gtmProfile.get, (r) => r?.profile);

export const useVocabularyRead = () =>
  useWrappedRead<SemanticCluster[]>('clusters', API.gtmProfile.clusters, (r) => r?.clusters ?? []);

export const useCompetitorsRead = () =>
  useWrappedRead<Competitor[]>('competitors', API.vani.competitors, (r) => r?.competitors ?? []);

export const useBrandRead = () =>
  useWrappedRead<TenantBrand | undefined>('brand', API.gtmProfile.getBrand, (r) => r?.brand);

export interface TenantDomain {
  domain: string;
  purpose: 'workspace' | 'candidate';
  verified_at: string | null;
  created_at: string;
}

/** The organisation as registered: its name and the industry (vn_tenant_profiles). */
export interface Organisation {
  name?: string | null;
  display_name?: string | null;
  industry?: string | null;
}

export const useOrganisationRead = () =>
  useWrappedRead<Organisation | undefined>('organisation', API.tenant.profile, (r) => r?.profile);

export const useDomainsRead = () =>
  useWrappedRead<TenantDomain[]>('domains', API.tenant.domains, (r) => r?.domains ?? []);
