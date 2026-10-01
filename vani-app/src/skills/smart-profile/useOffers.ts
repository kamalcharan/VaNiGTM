'use client';
/**
 * Offers — the BRAIN object for what the tenant sells. Agent-drafted from
 * what VaNi has read, human-confirmed; only a CONFIRMED offer counts toward
 * the profile score and only a READY one can be scored against.
 *
 * Everything is on the generic runner: reads and edits through research-skill
 * (get_offers / save_offer), drafting and confirming through profile-skill
 * (generate_offers / confirm_offer). No REST — the skill runner is the one
 * surface nginx exposes to the console.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';

export type Commitment = 'entry' | 'project' | 'retainer';

export interface Offer {
  /** The offer_key — the id the API uses. */
  id: string;
  name: string;
  one_line: string;
  who_for: string;
  problem: string;
  what_we_do: string[];
  signals: string[];
  disqualifiers: string[];
  price_band: string;
  proof: string;
  commitment: Commitment;
  source: 'agent' | 'human';
  confirmed_at: string | null;
  is_ready: boolean;
}

export interface OffersResult {
  offers: Offer[];
  /** Everything still missing before research can score against these. */
  problems: string[];
  ready: boolean;
}

export const COMMITMENTS: { value: Commitment; label: string; hint: string }[] = [
  { value: 'entry', label: 'Entry', hint: 'A workshop, an audit, an assessment — something a stranger can say yes to.' },
  { value: 'project', label: 'Project', hint: 'Bounded delivery with a start and an end.' },
  { value: 'retainer', label: 'Retainer', hint: 'Ongoing. Almost never a sane first ask.' },
];

export const KEY = ['skill', 'research-skill', 'get_offers'] as const;

export const useOffers = () => useSkillQuery<OffersResult>('research-skill', 'get_offers');

export function useOfferWrites() {
  const qc = useQueryClient();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['skill'] }), [qc]);

  const save = useSkillMutation<{ offer_key: string }>('research-skill', 'save_offer', {
    successMessage: 'Saved. Confirm it when it reads right — only a confirmed offer counts.',
    errorMessage: 'Could not save that offer.', onSuccess: refresh,
  });
  const generate = useSkillMutation<{ drafted: { offer_key: string; name: string }[] }>('profile-skill', 'generate_offers', {
    successMessage: (r) => r.drafted.length ? `Drafted ${r.drafted.length} ${r.drafted.length === 1 ? 'offer' : 'offers'} from what VaNi has read. Read them — nothing counts until you confirm.` : 'Nothing to draft from yet — VaNi has not read enough about you.',
    errorMessage: 'Could not draft offers.', onSuccess: refresh,
  });
  const confirm = useSkillMutation<{ success: boolean }>('profile-skill', 'confirm_offer', {
    successMessage: 'Confirmed. It counts toward your profile now.',
    errorMessage: 'Could not confirm that offer.', onSuccess: refresh,
  });

  return {
    save: (o: Omit<Offer, 'source' | 'confirmed_at' | 'is_ready'>) => save.mutate({ offer_key: o.id || undefined, ...o }),
    generate: () => generate.mutate({}),
    confirm: (offerKey: string) => confirm.mutate({ offer_key: offerKey }),
    busy: save.isPending || generate.isPending || confirm.isPending,
    generating: generate.isPending,
  };
}
