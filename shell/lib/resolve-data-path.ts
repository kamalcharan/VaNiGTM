/**
 * KI-32: Resolve a dotted/bracketed data path against a data object.
 *
 * Recipe slots define data paths like "goals[0]", "allocation",
 * "summary.total_value", "portfolio_summary.return_pct".
 * This utility resolves them against the skill response data.
 *
 * Examples:
 *   resolveDataPath({ goals: [{name: "A"}] }, "goals[0]")       → {name: "A"}
 *   resolveDataPath({ summary: { total: 100 } }, "summary.total") → 100
 *   resolveDataPath(data, "clients")                               → data.clients
 */
export function resolveDataPath(data: any, path: string): any {
  if (!data || !path) return data;

  return path
    .split(/[.\[\]]/)
    .filter(Boolean)
    .reduce((obj, key) => {
      if (obj == null) return undefined;
      const idx = Number(key);
      return obj[isNaN(idx) ? key : idx];
    }, data);
}

/**
 * Given skill response data and a recipe slot definition,
 * resolve the slot's "data" field to actual values.
 */
export function resolveSlotData(
  skillData: Record<string, any>,
  slotDataPath: string | undefined
): any {
  if (!slotDataPath) return skillData;
  return resolveDataPath(skillData, slotDataPath);
}
