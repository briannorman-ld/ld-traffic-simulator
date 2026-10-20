import type { VariationConfig } from '../types';

/** Rolls each event independently against the variation's rate (in percent). */
export function rollConversions(
  variation: VariationConfig | undefined,
  eventKeys: string[],
  rng: () => number = Math.random,
): string[] {
  if (!variation) return [];
  return eventKeys.filter((key) => rng() * 100 < (variation.rates[key] ?? 0));
}

/**
 * One roll per flag per event, using the variation each flag served. An event converts
 * when any flag's roll hits, so it's tracked at most once per visitor.
 */
export function rollConversionsAcrossFlags(
  served: (VariationConfig | undefined)[],
  eventKeys: string[],
  rng: () => number = Math.random,
): string[] {
  const hits = new Set(served.flatMap((v) => rollConversions(v, eventKeys, rng)));
  return eventKeys.filter((key) => hits.has(key));
}
