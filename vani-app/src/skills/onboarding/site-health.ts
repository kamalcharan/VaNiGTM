/**
 * The website health check, in one place. The ingestion agent records it as
 * the `site_health` run step ("present: …; missing: a, b; …"); the Mission
 * Wizard's "Free site audit" rail and the GTM landing's "Get discovered" card
 * both read it through this file, so the same finding has the same words
 * everywhere (2026-10-01: the GTM card had its own, different wording).
 */

/** Site-health signals → what's at stake (SEO/AEO/CRO framing). */
export const SITE_HEALTH_ADVICE: Record<string, { label: string; why: string }> = {
  title: { label: '<title> tag', why: 'the first thing search engines and AI read about you' },
  meta_description: { label: 'Meta description', why: 'the summary Google and AI answer engines quote in results' },
  og_tags: { label: 'OpenGraph tags', why: 'controls how your links preview on LinkedIn and WhatsApp' },
  json_ld: { label: 'JSON-LD structured data', why: 'makes your business quotable by AI answer engines like ChatGPT and Perplexity' },
  body_text: { label: 'Server-rendered content', why: 'your page is JS-only — crawlers and AI see an empty page' },
};

/** Findings rail: punchy teaser tags per missing signal (PLG hook for the Auditor agent). */
export const FINDING_TAGS: Record<string, { tag: string; hook: string }> = {
  title: { tag: 'No page title', hook: 'the first signal search engines read' },
  meta_description: { tag: 'Weak SEO', hook: 'Google has nothing to quote about you' },
  og_tags: { tag: 'Broken link previews', hook: 'shares on LinkedIn/WhatsApp show nothing' },
  json_ld: { tag: 'Invisible to AI', hook: 'AI answer engines can’t cite your business' },
  body_text: { tag: 'JS-only rendering', hook: 'non-JS crawlers see an empty page' },
};

/** Pull the health check out of the run steps: "present: …; missing: a, b; …" */
export function parseSiteHealth(steps: { step_name: string; output_summary?: string }[]): string[] | null {
  const step = steps.find((st) => st.step_name === 'site_health');
  const m = step?.output_summary?.match(/missing:\s*([^;]+)/);
  if (!m) return null;
  const missing = m[1].split(',').map((x) => x.trim()).filter((x) => x && x !== 'none');
  return missing.length > 0 ? missing : null;
}
