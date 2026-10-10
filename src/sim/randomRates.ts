import type { VariationConfig } from '../types';

export const RANDOM_RATE_MIN = 5;
export const RANDOM_RATE_MAX = 40;
/** Highest rate is at most this much above the lowest, relative (1.1 = 10%). */
export const RANDOM_RATE_MAX_RATIO = 1.1;

const round1 = (n: number) => Math.round(n * 10) / 10;
const floor1 = (n: number) => Math.floor(n * 10 + 1e-9) / 10;

/**
 * Random rates for one event: a base picked in [5, 40/1.1], then each variation in
 * [base, base × 1.1]. Rounded to 0.1, then clamped so rounding can't break the 10% bound.
 */
export function randomRatesForEvent(count: number, rng: () => number = Math.random): number[] {
  const base = RANDOM_RATE_MIN + rng() * (RANDOM_RATE_MAX / RANDOM_RATE_MAX_RATIO - RANDOM_RATE_MIN);
  const rates = Array.from({ length: count }, () => round1(base * (1 + rng() * (RANDOM_RATE_MAX_RATIO - 1))));
  const low = Math.max(RANDOM_RATE_MIN, Math.min(...rates));
  const high = Math.min(RANDOM_RATE_MAX, floor1(low * RANDOM_RATE_MAX_RATIO));
  return rates.map((r) => Math.min(high, Math.max(low, r)));
}

/** New rates for every variation, picked independently for each event key. */
export function randomizeRates(
  variations: VariationConfig[],
  eventKeys: string[],
  rng: () => number = Math.random,
): VariationConfig[] {
  const perEvent = eventKeys.map((key) => [key, randomRatesForEvent(variations.length, rng)] as const);
  return variations.map((v, i) => ({
    ...v,
    rates: { ...v.rates, ...Object.fromEntries(perEvent.map(([key, rates]) => [key, rates[i]])) },
  }));
}
