/**
 * /agents/vara/calibration — not built yet; ships with Phase 5 of the execution POA.
 */
import { NotYet } from '@/platform/shell/NotYet';
import { VARA_SKILLS } from '@/skills/vara-shell/vara-nav';

export default function Page() {
  const route = VARA_SKILLS.flatMap(m => m.routes).find(r => r.href === '/agents/vara/calibration');
  if (!route) return null;
  return <NotYet route={route} />;
}
