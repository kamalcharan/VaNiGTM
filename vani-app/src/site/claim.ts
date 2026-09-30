'use client';
/**
 * After signup: keep the website preview the visitor made on vani.vikuna.io.
 *
 * `POST /api/v1/funnel/claim` (VaNiGTM) attaches the read to the new
 * workspace in one transaction — knowledge source, full crawl queued — then
 * writes the card into the Smart Profile and the graph into the knowledge
 * graph. This runs right after `register` returns a session, so the preview
 * is the workspace's first Smart Profile.
 *
 * It never blocks signup. It returns what happened, and the caller says it:
 * a claim that fails is reported with the server's reason (rule 12), and the
 * token is kept so nothing is lost if they try again from the landing page.
 */
import { callSkill } from '@/lib/useSkill';
import { installSkillTransport } from '@/lib/transport';
import { loadToken, saveToken } from './funnel';

export interface ClaimResult {
  site: string;
  profile_applied: boolean;
  graph_written?: { nodes: number; edges: number; failed: number };
  already_claimed?: boolean;
  detail?: string;
}

export type ClaimOutcome =
  | { kind: 'none' }
  | { kind: 'kept'; result: ClaimResult }
  | { kind: 'failed'; message: string };

export async function claimPreviewAfterSignup(): Promise<ClaimOutcome> {
  const token = loadToken();
  if (!token) return { kind: 'none' };
  installSkillTransport();
  try {
    const result = await callSkill<ClaimResult>('funnel', 'claim', { token });
    saveToken(null);
    return { kind: 'kept', result };
  } catch (e) {
    return { kind: 'failed', message: e instanceof Error ? e.message : 'the preview could not be attached' };
  }
}
