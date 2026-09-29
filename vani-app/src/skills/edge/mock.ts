/**
 * Edge's preview reads. The mission itself lives in the browser (store.ts);
 * the only thing the console asks the transport for is journey progress for
 * the dashboard card, and that has no backend yet — so it is answered here,
 * stamped preview like GTM's (lib/preview.ts). It leaves this file the day
 * `edge.journey` lands on the API.
 */
import type { JourneyProgress } from '@/platform/registry';

export const EDGE_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'edge.journey': (): JourneyProgress => ({ done: [], current: 'context', note: 'Not started — open Edge to begin.' }),
};
