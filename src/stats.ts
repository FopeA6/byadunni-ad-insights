import type { Range } from "./types.js";

const Z_95 = 1.959964;

/**
 * Wilson score interval: a 95% range for a rate such as "purchases per click".
 *
 * With small numbers, a raw rate is misleading: 1 purchase from 10 clicks is "10%", but the true
 * rate could easily be anywhere from about 2% to 40%. The Wilson range says that out loud, and it
 * behaves sensibly at 0 and at small counts, where the simpler "plus or minus" formula breaks.
 *
 * Returns percentages, or null when there are no trials or the counts don't make sense
 * (for example more purchases than clicks, which Meta can report with view-through attribution).
 */
export function wilsonRange(successes: number, trials: number): Range | null {
  if (trials <= 0 || successes < 0 || successes > trials) return null;
  const p = successes / trials;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / trials;
  const centre = (p + z2 / (2 * trials)) / denominator;
  const half = (Z_95 * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator;
  return {
    low: round(Math.max(0, centre - half) * 100, 1),
    high: round(Math.min(1, centre + half) * 100, 1),
  };
}

export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function rangesOverlap(a: Range, b: Range): boolean {
  return a.low <= b.high && b.low <= a.high;
}
