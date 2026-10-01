/**
 * The industry choices, in one place: the Mission Wizard's company card and
 * the organisation step both offer exactly this list.
 *
 * The industry is the Smart Profile's (what the company is), stored for now in
 * vn_tenant_profiles.industry because that is what Vara and the industry
 * research read. Saving it goes through the `business_profile` lane step,
 * whose server writer stores it and starts the research
 * (DOMAIN_ENRICHMENT_REQUESTED) in the same call.
 *
 * Kept short on purpose. A list nobody's business is on teaches nothing.
 */
export const INDUSTRIES = [
  'Financial services', 'Manufacturing', 'Healthcare', 'Retail & e-commerce',
  'Technology & SaaS', 'Logistics', 'Education', 'Professional services',
  'Real estate', 'Other',
];

export const INDUSTRY_NOTE =
  'Picks the playbooks every agent starts from. Saving it starts VaNi researching how your industry hires, in the background.';
