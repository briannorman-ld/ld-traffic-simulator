import type { VariationConfig, VariationStats } from '../types';

/** A variation whose average gap is within this many percentage points counts as on target. */
export const ON_TARGET_PTS = 5;

/**
 * Average of (actual − target) conversion rate across event keys, in percentage points.
 * Null when there's nothing to compare: no configured rates, no exposures or no events.
 */
export function targetGap(
  stats: VariationStats,
  variation: VariationConfig | undefined,
  eventKeys: string[],
): number | null {
  if (!variation || stats.exposures === 0 || eventKeys.length === 0) return null;
  const sum = eventKeys.reduce(
    (acc, key) => acc + ((stats.conversions[key] ?? 0) / stats.exposures) * 100 - (variation.rates[key] ?? 0),
    0,
  );
  return sum / eventKeys.length;
}
