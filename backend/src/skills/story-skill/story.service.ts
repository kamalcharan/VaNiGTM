/**
 * Story writes.
 *
 * `trace.ts` holds R-S1 and R-S2 as pure functions. This holds the two
 * things the rules need from storage — the journey's brief evidence, and
 * the earlier stories on the same journey — and the actual writes.
 *
 * Runs inside the caller's transaction. Whichever change caused the story
 * (a draft save, an approval that also moves the journey, a send that
 * consumes it) commits with its side effects or with none of them.
 */

import type { SkillDb } from '../../shared/types';
import { type EvidenceLine } from './trace';

interface Scope { tenant_id: string; is_live: boolean }

/* ── Read helpers ─────────────────────────────────────────────────────── */

interface RawEvidence { claim?: string; url?: string; excerpt?: string }

/**
 * Evidence lines that the brief actually verified — the same array R-S1
 * reads. Empty when no brief exists yet; callers that get an empty list
 * back must refuse to write a story rather than silently allowing anything.
 */
export async function briefEvidenceFor(
  db: SkillDb, scope: Scope, journeyId: number,
): Promise<{ prospect_id: number; evidence: EvidenceLine[]; offer: string | null } | null> {
  const res = await db.query<{
    prospect_id: string;
    raw_evidence: RawEvidence[] | null;
    human_offer: string | null;
    recommended_offer: string | null;
  }>(
    `SELECT j.prospect_id::text,
            b.raw_evidence, b.human_offer, b.recommended_offer
       FROM gt_journeys j
       LEFT JOIN LATERAL (
         SELECT raw_evidence, human_offer, recommended_offer
           FROM gt_account_briefs ab
          WHERE ab.prospect_id = j.prospect_id
            AND ab.tenant_id   = j.tenant_id
            AND ab.is_live     = j.is_live
          ORDER BY ab.updated_at DESC LIMIT 1
       ) b ON true
      WHERE j.id = $journey_id
        AND j.tenant_id = $tenant_id AND j.is_live = $is_live`,
    { journey_id: journeyId, tenant_id: scope.tenant_id, is_live: scope.is_live },
  );
  if (!res.rows[0]) return null;

  const raw = Array.isArray(res.rows[0].raw_evidence) ? res.rows[0].raw_evidence : [];
  const evidence: EvidenceLine[] = raw
    .filter((e) => e && e.claim && e.url)
    .map((e) => ({ claim: String(e.claim), url: String(e.url) }));

  return {
    prospect_id: Number(res.rows[0].prospect_id),
    evidence,
    offer: res.rows[0].human_offer ?? res.rows[0].recommended_offer ?? null,
  };
}

/** Bodies of every earlier story on the same journey — what R-S2 reads.
 *  Includes drafts on purpose: two half-written stories can accidentally
 *  say the same thing, and the third would then repeat both. */
export async function earlierStoriesFor(
  db: SkillDb, scope: Scope, journeyId: number, exceptId?: number,
): Promise<string[]> {
  const res = await db.query<{ body: string }>(
    `SELECT body FROM gt_journey_stories
      WHERE journey_id = $journey_id
        AND tenant_id = $tenant_id AND is_live = $is_live
        AND ($except_id::bigint IS NULL OR id <> $except_id::bigint)
        AND status <> 'archived'
      ORDER BY seq`,
    {
      journey_id: journeyId, tenant_id: scope.tenant_id, is_live: scope.is_live,
      except_id: exceptId ?? null,
    },
  );
  return res.rows.map((r) => r.body);
}

/** Whether a kind_key is one this tenant may write. System kinds are
 *  visible to every tenant; a tenant may add its own. */
export async function kindExists(
  db: SkillDb, scope: Scope, kindKey: string,
): Promise<boolean> {
  const res = await db.query(
    `SELECT 1 FROM gt_content_kinds
      WHERE kind_key = $kind_key
        AND (is_system = true OR tenant_id = $tenant_id)
        AND is_active = true LIMIT 1`,
    { kind_key: kindKey, tenant_id: scope.tenant_id },
  );
  return res.rows.length > 0;
}
