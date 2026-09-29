/**
 * How an ingestion run's steps read to a tenant — shared by the Mission
 * Wizard (onboarding) and the Knowledge page (Teach VaNi, Read again), so a
 * read looks the same wherever it was started.
 */

/**
 * Steps the pipeline records for US, never for the tenant.
 *
 * `llm_failover` is written by agent-core whenever the local model is
 * unreachable and the call is retried on Claude, and it carries the raw VPS
 * error in its action text. That belongs in gt_agent_runs, not on a customer's
 * screen: which model answered is our operational detail, and surfacing it
 * turns "VaNi is analysing your site" into a visible internal wobble.
 *
 * Hidden from the FEED only — the row is still stored, still auditable, and
 * still shows in the run history. Nothing is swallowed.
 */
export const INTERNAL_STEPS = new Set(['llm_failover']);

/** Friendly labels for the agent's real pipeline steps (gt_agent_runs.steps). */
export const RESEARCH_STEP_LABELS: Record<string, string> = {
  parse: 'Connected — reading your website',
  parse_complete: 'Website read',
  site_health: 'Website health check',
  render_page: 'JS-rendered site — opening it in a headless browser',
  render_complete: 'Rendered page read',
  draft_profile: 'Drafting your GTM profile',
  crawl_pages: 'Exploring more pages of your site',
  crawl_complete: 'Site crawl finished',
  draft_profile_enriched: 'Filling profile gaps from deeper pages',
  chunk: 'Organizing what I found',
  extract: 'Deep-reading each section',
  extract_complete: 'Knowledge extracted',
  complete: 'Saved to your knowledge graph',
};

/** Lines cycled under the loader while an agent phase sits silent. */
export const RESEARCH_ROTATION = [
  'Reading your pages the way a first-time buyer would',
  'Pulling out what you sell, who for, and what it fixes',
  'Noting proof — case studies, numbers, differentiators',
  'Writing it all into your knowledge graph',
];

export interface AgentRunStep {
  step_name: string;
  action?: string;
  output_summary?: string;
  status?: string;
}
