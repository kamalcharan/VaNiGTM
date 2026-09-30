/**
 * Access requests — who asked to join VaNi's closed beta from vani.vikuna.io.
 *
 * Backend: VaNiGTM `access-skill.list_requests` (read-only). Requests land
 * only in the workspace named by FUNNEL_LEADS_TENANT_SLUG — Vikuna's own —
 * so the route is adminOnly: another tenant would only ever see an empty list.
 */
import type { SkillModule } from '@/platform/registry';

const accessRequests: SkillModule = {
  id: 'access-requests',
  name: 'Access requests',
  routes: [
    { id: 'access-requests', label: 'Access requests', href: '/access-requests', group: 'organization', icon: '✉', status: 'live', adminOnly: true,
      summary: 'Who asked to join the closed beta from vani.vikuna.io, with the site they read and what they agreed to.' },
  ],
};
export default accessRequests;
