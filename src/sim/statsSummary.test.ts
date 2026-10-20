import { describe, expect, it } from 'vitest';
import type { VariationConfig, VariationStats } from '../types';
import { targetGap } from './statsSummary';

const variation: VariationConfig = { id: 'v', index: 0, label: 'A', rates: { buy: 10, signup: 20 } };
const stats = (exposures: number, conversions: Record<string, number>): VariationStats => ({
  index: 0,
  value: true,
  exposures,
  conversions,
});

describe('targetGap', () => {
  it('averages actual minus target across events, in points', () => {
    // buy: 30% vs 10% (+20), signup: 20% vs 20% (0)
    expect(targetGap(stats(100, { buy: 30, signup: 20 }), variation, ['buy', 'signup'])).toBeCloseTo(10);
    expect(targetGap(stats(100, {}), variation, ['buy', 'signup'])).toBeCloseTo(-15);
  });

  it('is null when there is nothing to compare', () => {
    expect(targetGap(stats(0, {}), variation, ['buy'])).toBeNull();
    expect(targetGap(stats(10, { buy: 1 }), undefined, ['buy'])).toBeNull();
    expect(targetGap(stats(10, { buy: 1 }), variation, [])).toBeNull();
  });
});
