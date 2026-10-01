/**
 * The VaNiGTM component surface the mission wizard is written against.
 *
 * These are ported VERBATIM from VaNiGTM's `frontend/src/components/vdf/`, and
 * the `Vdf*` names are kept on purpose. The mission wizard is ~1900 lines that
 * both repos will keep editing; every rename here would be a merge conflict
 * there. Same reasoning as the loader and toast APIs (see CLAUDE.md §1).
 *
 * Two names are aliases rather than copies, because vani-app already had the
 * component under its own name and a second copy would be the thing that
 * drifts:
 *
 *   VdfPathwayShell → PathwayShell  (built to this exact prop contract)
 *   VdfLoader       → VaniLoader    (mirrors VdfLoader, VaNi mark instead)
 */

export { PathwayShell as VdfPathwayShell } from '../pathway/PathwayShell';
export type { PathwayShellProps as VdfPathwayShellProps } from '../pathway/PathwayShell';
export { VaniLoader as VdfLoader } from '../feedback/loader';
export type { VaniLoaderProps as VdfLoaderProps } from '../feedback/loader';

export { VdfButton } from './VdfButton';
export { VdfApprovalCard } from './VdfApprovalCard';
export { VdfKgLoader } from './VdfKgLoader';
export { VdfMissionMemory } from './VdfMissionMemory';
export type { VdfMissionMemoryItem, VdfMissionMemoryProps } from './VdfMissionMemory';
export {
  VdfMissionSection,
  VdfMissionCard,
  VdfMissionChips,
  VdfMissionRows,
} from './VdfMissionArtifact';
export type {
  VdfMissionSectionProps,
  VdfMissionCardProps,
  VdfMissionChip,
  VdfMissionChipsProps,
  VdfMissionRow,
} from './VdfMissionArtifact';

/* ── Also needed by the icp-builder refine surface ───────────────────────── */
export { VdfPageHeader } from './VdfPageHeader';
export { VdfWizard } from './VdfWizard';
export { VdfCard } from './VdfCard';
export { VdfReadinessRing } from './VdfReadinessRing';
export { VdfKpiCard } from './VdfKpiCard';
export { VdfErrorScreen } from './VdfErrorScreen';
export { VdfInput } from './VdfInput';
