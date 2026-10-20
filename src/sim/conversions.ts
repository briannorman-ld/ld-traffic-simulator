import type { VariationConfig } from '../types';

/** Upper bound on occurrences per visitor per event, so a large average can't flood the event pipeline. */
export const MAX_OCCURRENCES = 100;

/** Rolls each event independently against the variation's rate (in percent). */
export function rollConversions(
  variation: VariationConfig | undefined,
  eventKeys: string[],
  rng: () => number = Math.random,
): string[] {
  if (!variation) return [];
  return eventKeys.filter((key) => rng() * 100 < (variation.rates[key] ?? 0));
}

/** The configured average occurrences for an event; missing means 1. */
export const avgOccurrences = (variation: VariationConfig | undefined, key: string): number =>
  variation?.occurrences?.[key] ?? 1;

/**
 * How many times a visitor who fires an event fires it: a shifted geometric draw (N ≥ 1) whose
 * mean is `mean`, capped at MAX_OCCURRENCES. A mean of 1 or less is always 1 and uses no random number.
 */
export function sampleOccurrences(mean: number, rng: () => number = Math.random): number {
  if (!(mean > 1)) return 1;
  const u = 1 - rng(); // (0, 1], so the log is finite
  const n = Math.ceil(Math.log(u) / Math.log(1 - 1 / mean));
  return Math.min(MAX_OCCURRENCES, Math.max(1, n));
}

/** The events a visitor fires and how many times each: rolls every rate first, then samples counts. */
export function rollEvents(
  variation: VariationConfig | undefined,
  eventKeys: string[],
  rng: () => number = Math.random,
): { key: string; count: number }[] {
  return rollConversions(variation, eventKeys, rng).map((key) => ({
    key,
    count: sampleOccurrences(avgOccurrences(variation, key), rng),
  }));
}
