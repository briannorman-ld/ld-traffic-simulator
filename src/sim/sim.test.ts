import { describe, expect, it } from 'vitest';
import type { ContextKindConfig, VariationConfig } from '../types';
import { buildContext, describeContext } from './contextBuilder';
import { MAX_OCCURRENCES, rollConversions, rollEvents, sampleOccurrences } from './conversions';

const kind = (over: Partial<ContextKindConfig>): ContextKindConfig => ({
  id: 'k',
  kind: 'user',
  keyPrefix: '',
  anonymous: false,
  attributes: [],
  ...over,
});

describe('buildContext', () => {
  it('builds a single-kind context with prefix, typed attributes and no anonymous flag', () => {
    const ctx = buildContext(
      [
        kind({
          keyPrefix: 'sim-',
          attributes: [
            { id: '1', name: 'plan', value: 'pro', type: 'string' },
            { id: '2', name: 'seats', value: '12', type: 'number' },
            { id: '3', name: 'beta', value: 'TRUE', type: 'boolean' },
          ],
        }),
      ],
      () => 'abc',
    );
    expect(ctx).toEqual({ kind: 'user', key: 'sim-abc', plan: 'pro', seats: 12, beta: true });
  });

  it('marks anonymous kinds', () => {
    expect(buildContext([kind({ anonymous: true })], () => 'x')).toEqual({ kind: 'user', key: 'x', anonymous: true });
  });

  it('combines several kinds into one multi-context', () => {
    let n = 0;
    const ctx = buildContext(
      [kind({ kind: 'user', keyPrefix: 'u-' }), kind({ kind: 'device', anonymous: true })],
      () => String(++n),
    );
    expect(ctx).toEqual({ kind: 'multi', user: { key: 'u-1' }, device: { key: '2', anonymous: true } });
    expect(describeContext(ctx)).toBe('user:u-1 + device:2');
  });

  it("can't be overridden by attributes named key or anonymous", () => {
    const ctx = buildContext(
      [kind({ attributes: [{ id: '1', name: 'key', value: 'hijack', type: 'string' }] })],
      () => 'real',
    );
    expect((ctx as { key: string }).key).toBe('real');
  });

  it('generates a unique key per call by default', () => {
    const a = buildContext([kind({})]) as { key: string };
    const b = buildContext([kind({})]) as { key: string };
    expect(a.key).not.toBe(b.key);
  });
});

describe('rollConversions', () => {
  const variation: VariationConfig = { id: 'v', index: 0, label: 'A', rates: { buy: 30, signup: 100 } };

  it('converts when the roll is under the rate', () => {
    expect(rollConversions(variation, ['buy', 'signup'], () => 0.29)).toEqual(['buy', 'signup']);
    expect(rollConversions(variation, ['buy', 'signup'], () => 0.3)).toEqual(['signup']);
  });

  it('treats missing rates as 0 and unmatched variations as no conversions', () => {
    expect(rollConversions(variation, ['other'], () => 0)).toEqual([]);
    expect(rollConversions(undefined, ['buy'], () => 0)).toEqual([]);
  });

  it('lands near the target rate over many visitors', () => {
    let hits = 0;
    for (let i = 0; i < 20000; i++) hits += rollConversions(variation, ['buy']).length;
    expect(hits / 20000).toBeGreaterThan(0.28);
    expect(hits / 20000).toBeLessThan(0.32);
  });
});

describe('sampleOccurrences', () => {
  const mean = (m: number, draws = 100_000) => {
    let sum = 0;
    for (let i = 0; i < draws; i++) {
      const n = sampleOccurrences(m);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(n)).toBe(true);
      sum += n;
    }
    return sum / draws;
  };

  it('always returns exactly 1 for a mean of 1, without using a random number', () => {
    const rng = () => {
      throw new Error('should not roll');
    };
    expect(sampleOccurrences(1, rng)).toBe(1);
    expect(mean(1, 1000)).toBe(1);
  });

  it('is at least 1 even at the ends of the random range', () => {
    expect(sampleOccurrences(4.9, () => 0)).toBe(1);
    expect(sampleOccurrences(4.9, () => 0.999_999_999)).toBeGreaterThan(1);
  });

  it.each([1, 2.5, 4.9])('averages %s over 100k draws', (m) => {
    expect(Math.abs(mean(m) - m)).toBeLessThan(0.1);
  });

  it(`caps at ${MAX_OCCURRENCES}`, () => {
    expect(sampleOccurrences(1e9, () => 0.999_999)).toBe(MAX_OCCURRENCES);
  });
});

describe('rollEvents', () => {
  const variation: VariationConfig = {
    id: 'v',
    index: 0,
    label: 'A',
    rates: { view: 100, buy: 100, never: 0 },
    occurrences: { view: 3, never: 5 },
  };

  it('samples a count for each fired event and defaults the average to 1', () => {
    const events = rollEvents(variation, ['view', 'buy', 'never'], () => 0.5);
    expect(events.map((e) => e.key)).toEqual(['view', 'buy']);
    expect(events.find((e) => e.key === 'buy')!.count).toBe(1);
    expect(events.find((e) => e.key === 'view')!.count).toBeGreaterThanOrEqual(1);
  });

  it('matches rollConversions exactly when no averages are set', () => {
    const old: VariationConfig = { id: 'v', index: 0, label: 'A', rates: { buy: 30, signup: 60 } };
    const seq = [0.1, 0.5, 0.2, 0.9, 0.7, 0.4];
    const fromSeq = () => {
      let i = 0;
      return () => seq[i++ % seq.length];
    };
    for (let start = 0; start < 3; start++) {
      const a = fromSeq();
      const b = fromSeq();
      for (let i = 0; i < start; i++) {
        a();
        b();
      }
      expect(rollEvents(old, ['buy', 'signup'], a)).toEqual(
        rollConversions(old, ['buy', 'signup'], b).map((key) => ({ key, count: 1 })),
      );
      expect(a()).toBe(b()); // and used the same random numbers
    }
  });
});
