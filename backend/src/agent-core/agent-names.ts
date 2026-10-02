/**
 * Which agent a run belongs to (AGENTS.md §4 rule 3, POA Sprint 0a).
 *
 * `gt_agent_runs.agent_name` holds the run's KEY — the event type the worker
 * dispatched, or a skill.function for runs started by a route. That key is
 * load-bearing and stays: the failover approval re-emits the original event
 * from it, and research / domain-pack resumption look runs up by it. Every
 * historical row carries it too.
 *
 * So the agent is resolved from the key HERE, once, at read time — the runs
 * screens, the dashboard and the failover queue all name a run the same way.
 * A key with no entry is shown as itself, never hidden.
 */
const AGENT_OF: Record<string, string> = {
  TENANT_REGISTERED: 'VaNi',
  HUMAN_APPROVED: 'VaNi',
  FILE_UPLOADED: 'Ingestion',
  URL_SUBMITTED: 'Ingestion',
  FOLDER_CONNECTED: 'Ingestion',
  KNOWLEDGE_UPDATED: 'Profile drafter',
  COMPETITOR_RESEARCH_REQUESTED: 'Competitor research',
  ACCOUNT_RESEARCH_REQUESTED: 'Account research',
  FIT_LESSONS_REQUESTED: 'Fit lessons',
  DOMAIN_ENRICHMENT_REQUESTED: 'Domain pack research',
  FUNNEL_SITE_SUBMITTED: 'Website preview',
  IMPORT_STAGE_REQUESTED: 'Import staging',
  POOL_RESOLVE_REQUESTED: 'Pool matching',
  SCORE_REFRESH_REQUESTED: 'Scoring',
  'brand-skill.generate': 'Brand',
  'profile-skill.offers.generate': 'Offer drafting',
};

export function agentOf(key: string | null | undefined): string {
  if (!key) return 'unknown';
  return AGENT_OF[key] ?? key;
}

/** Every key the registry names — a test checks the worker's events are all here. */
export const NAMED_RUN_KEYS = Object.keys(AGENT_OF);
