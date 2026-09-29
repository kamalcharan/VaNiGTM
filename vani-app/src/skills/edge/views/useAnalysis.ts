'use client';
/**
 * The analysis behind chapters 8–10, as a query so the screens get the
 * console's five states. One source for both evidence modes:
 *
 *   sample  → the four sample registers, fetched once and run through the
 *             engine; the result is kept on the mission so a reload does not
 *             recompute.
 *   own     → whatever the tenant attached and confirmed on chapter 7. The
 *             engine ran at confirmation; the result lives on the mission.
 *             Nothing attached, nothing confirmed → no numbers, and the
 *             screen says so (never a sample in disguise: VaNiGTM rule 12).
 *
 * O2C has no engine yet: the sample keeps the invented scenario, own data
 * is honestly "not analysed".
 */
import { useQuery } from '@tanstack/react-query';
import type { SkillResult } from '@/lib/useSkill';
import type { Analysis, Graph } from '../engine/analyse';
import { runAnalysis, sampleTables } from '../engine/files';
import { o2c } from '../mission/reference';
import { useMission } from '../mission/MissionProvider';

export interface AnalysisBundle {
  /** The network to draw, or null when nothing has been analysed. */
  graph: Graph | null;
  /** Full engine output for P2P; null for O2C or when nothing was analysed. */
  analysis: Analysis | null;
  source: 'sample' | 'own' | 'none';
}

export function useAnalysis() {
  const { m, update } = useMission();
  const key = ['edge', 'analysis', m.process, m.mode, m.analysis?.meta.generatedAt ?? 'none'];
  return useQuery<SkillResult<AnalysisBundle>, Error>({
    queryKey: key,
    staleTime: Infinity,
    queryFn: async () => {
      const wrap = (data: AnalysisBundle): SkillResult<AnalysisBundle> => ({ success: true, skill: 'edge', function: 'analysis', data });
      if (m.process === 'o2c') return wrap(m.mode === 'sample' ? { graph: o2c, analysis: null, source: 'sample' } : { graph: null, analysis: null, source: 'none' });
      if (m.analysis && m.analysisSource === m.mode) return wrap({ graph: m.analysis.graph, analysis: m.analysis, source: m.mode });
      if (m.mode === 'sample') {
        const a = runAnalysis(await sampleTables());
        update((d) => { d.analysis = a; d.analysisSource = 'sample'; });
        return wrap({ graph: a.graph, analysis: a, source: 'sample' });
      }
      return wrap({ graph: null, analysis: null, source: 'none' });
    },
  });
}
