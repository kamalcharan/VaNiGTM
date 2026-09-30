'use client';
/**
 * The public funnel on vani.vikuna.io: a visitor types a website, VaNi reads
 * the homepage, and the page shows what it learned — before any account.
 *
 * Backend: VaNiGTM `backend/src/funnel/` (`/api/v1/funnel/*`, public routes).
 * Reached through live-transport's PLATFORM_ROUTES, like auth — it is a
 * pre-account surface, so the JWT skill runner cannot serve it.
 *
 * Contract: VaNiGTM `funnel.service.ts` SiteStatus. `audit`, `graph`,
 * `graph_failure` and `read_at` arrived with migration 262 and are null on
 * reads made before it; the page renders a block only when its field is
 * present, and never substitutes anything when it is not.
 */
import { useSkillQuery } from '@/lib/useSkill';
import type { CanvasEdge, CanvasNode } from '@/skills/smart-profile/screens/KgCanvas';

export interface Card {
  product_name: string | null;
  product_tagline: string | null;
  product_category: string | null;
  product_description: string | null;
}

/** The five crawlability checks the ingestion agent measures on the static page. */
export type AuditCheck = 'title' | 'meta_description' | 'og_tags' | 'json_ld' | 'body_text';
export interface Audit { present: AuditCheck[]; missing: AuditCheck[] }

export interface SiteGraph { nodes: CanvasNode[]; edges: CanvasEdge[] }

export interface SiteStatus {
  status: 'reading' | 'read' | 'failed';
  site: string;
  card: Card | null;
  /** The real reason, when failed. */
  failure: string | null;
  claimed: boolean;
  audit?: Audit | null;
  /** `partial`: built from only the first part of a long page, or an answer was cut off. */
  graph?: (SiteGraph & { partial?: boolean }) | null;
  /** Set when the card read but the graph extraction did not — the card still shows. */
  graph_failure?: string | null;
  /** When the read finished; shown when an earlier read is being reused. */
  read_at?: string | null;
}

export interface SubmitResult extends SiteStatus {
  token: string;
  /** new = read started now; site = someone read this site recently; session = this browser already had it; in_progress = a read is running. */
  reused: 'new' | 'site' | 'session' | 'in_progress';
}

/** Polls while the read is in progress and stops by itself once it is not. */
export const useSiteStatus = (token: string | null) =>
  useSkillQuery<SiteStatus>('funnel', 'site_status', { token }, {
    enabled: !!token,
    retry: false,
    refetchInterval: (q) => (q.state.data?.success && q.state.data.data.status === 'reading' ? 3000 : false),
  });

/** The browser's own funnel token, so a return visit shows the same read rather than paying for a new one. */
const TOKEN_KEY = 'vani-funnel-token';
export function loadToken(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function saveToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage blocked — the read still works, it just is not remembered */ }
}
