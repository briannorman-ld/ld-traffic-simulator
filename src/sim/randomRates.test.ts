import { describe, expect, it } from 'vitest';
import type { VariationConfig } from '../types';
import { randomizeRates, randomRatesForEvent } from './randomRates';

describe('randomRatesForEvent', () => {
  it('stays within 5–40% and within 10% (relative) of each other', () => {
    for (let i = 0; i < 5000; i++) {
      const rates = randomRatesForEvent(1 + (i % 5));
      const lo = Math.min(...rates);
      const hi = Math.max(...rates);
      expect(lo).toBeGreaterThanOrEqual(5);
      expect(hi).toBeLessThanOrEqual(40);
      expect(hi).toBeLessThanOrEqual(lo * 1.1 + 1e-9);
    }
  });

  it('hits the edges of the range without breaking bounds', () => {
    expect(randomRatesForEvent(3, () => 0)).toEqual([5, 5, 5]);
    const top = randomRatesForEvent(3, () => 0.999999);
    expect(Math.max(...top)).toBeLessThanOrEqual(40);
  });
});

describe('randomizeRates', () => {
  it('sets every event key on every variation and keeps other fields', () => {
    const vars: VariationConfig[] = [
      { id: 'a', index: 0, label: 'A', rates: { old: 1 }, occurrences: { buy: 3.5 } },
      { id: 'b', index: 1, label: 'B', rates: {} },
    ];
    const out = randomizeRates(vars, ['buy', 'signup']);
    expect(out.map((v) => v.label)).toEqual(['A', 'B']);
    for (const v of out) {
      expect(Object.keys(v.rates)).toEqual(expect.arrayContaining(['buy', 'signup']));
      expect(v.rates.buy).toBeGreaterThanOrEqual(5);
      expect(v.rates.signup).toBeLessThanOrEqual(40);
    }
    expect(out[0].rates.old).toBe(1);
    expect(out[0].occurrences).toEqual({ buy: 3.5 }); // only the % is randomized
  });
});
