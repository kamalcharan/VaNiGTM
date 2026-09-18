/**
 * Must-have weights are a SPLIT OF 100, and the editors must keep them one.
 *
 * Charan, 2026-09-18, looking at a family sitting at 110%: "weightage is
 * exceeding 100% - it should never". Both editors let ± add weight out of thin
 * air — press + four times and the shape claims 120% of the decision. It reads
 * as a bug to anyone who looks, and it quietly changes what every other
 * must-have is worth, because a weight only means something relative to the
 * rest.
 *
 * So every edit here CONSERVES the total. Raising one must-have takes the
 * difference from the others in proportion to what they already hold; dropping
 * one gives its weight back the same way. Nothing is invented and nothing
 * evaporates.
 *
 * Integers, because the UI shows whole percents and a 33.333 would render as
 * 33 three times and total 99. The rounding drift lands on the largest of the
 * others, which is the one place a ±1 is least visible.
 */

export interface Weighted { name: string; weight: number; years?: number; why?: string }

/** The floor a must-have can be pushed to before it stops meaning anything. */
const MIN = 1;
export const TOTAL = 100;

function settle<T extends Weighted>(items: T[], fixed: number): T[] {
  // `fixed` is the index whose weight the tenant just set; everything else
  // absorbs the change. -1 means "no anchor, scale them all".
  const anchored = fixed >= 0 ? items[fixed].weight : 0;
  const others = items.filter((_, i) => i !== fixed);
  const room = TOTAL - anchored;

  if (!others.length) {
    return items.map((m, i) => (i === fixed ? { ...m, weight: TOTAL } : m));
  }

  const pool = others.reduce((n, m) => n + m.weight, 0);
  // A pool of zero cannot be scaled proportionally — split the room evenly
  // rather than dividing by zero and writing NaN into every weight.
  const scaled = others.map((m) => ({
    ...m,
    weight: Math.max(MIN, Math.round(pool > 0 ? (m.weight / pool) * room : room / others.length)),
  }));

  // Rounding never lands exactly. Put the remainder on the heaviest of the
  // others, where ±1 changes the least.
  let drift = room - scaled.reduce((n, m) => n + m.weight, 0);
  if (drift !== 0) {
    let heavy = 0;
    scaled.forEach((m, i) => { if (m.weight > scaled[heavy].weight) heavy = i; });
    scaled[heavy] = { ...scaled[heavy], weight: Math.max(MIN, scaled[heavy].weight + drift) };
    drift = 0;
  }

  const out: T[] = [];
  let k = 0;
  items.forEach((m, i) => out.push(i === fixed ? m : scaled[k++]));
  return out;
}

/** Raise or lower one must-have; the rest absorb it. */
export function bump<T extends Weighted>(items: T[], i: number, by: number): T[] {
  if (!items[i]) return items;
  // The anchor cannot take the whole 100 when others exist — each of them
  // keeps at least MIN, or "the rest" would be a row of zeros.
  const ceiling = TOTAL - MIN * Math.max(0, items.length - 1);
  const next = Math.max(MIN, Math.min(ceiling, items[i].weight + by));
  const withSet = items.map((m, j) => (j === i ? { ...m, weight: next } : m));
  return settle(withSet, i);
}

/** Drop one; its weight goes back to the others in proportion. */
export function drop<T extends Weighted>(items: T[], i: number): T[] {
  const rest = items.filter((_, j) => j !== i);
  if (rest.length === 0) return items;      // one must-have is the floor
  return settle(rest, -1);
}

/** Add one at `weight`, taking the room from the others. */
export function add<T extends Weighted>(items: T[], item: T, weight = 20): T[] {
  const ceiling = TOTAL - MIN * items.length;
  const w = Math.max(MIN, Math.min(ceiling, weight));
  const next = [...items, { ...item, weight: w }];
  return settle(next, next.length - 1);
}

/**
 * Bring an incoming shape to 100 without changing what it says.
 *
 * Used on a shape that arrives off-total — a pack written to 99, or a family
 * edited before this rule existed. Ratios are preserved, so it is a
 * presentation fix rather than a re-decision, but it is still never applied
 * silently: the editors offer it, the tenant presses it.
 */
export function balance<T extends Weighted>(items: T[]): T[] {
  if (!items.length) return items;
  return settle(items, -1);
}

export const total = (items: Weighted[]): number =>
  items.reduce((n, m) => n + m.weight, 0);
