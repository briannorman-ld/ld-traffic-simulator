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
