import { describe, expect, it } from 'vitest';
import type { ContextKindConfig, VariationConfig } from '../types';
import { buildContext, describeContext } from './contextBuilder';
import { rollConversions, rollConversionsAcrossFlags } from './conversions';

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

describe('rollConversionsAcrossFlags', () => {
  const a: VariationConfig = { id: 'a', index: 0, label: 'A', rates: { buy: 100, signup: 0 } };
  const b: VariationConfig = { id: 'b', index: 1, label: 'B', rates: { buy: 0, signup: 100 } };

  it('fires an event once when any flag hits, in event-key order', () => {
    expect(rollConversionsAcrossFlags([b, a], ['buy', 'signup'], () => 0.5)).toEqual(['buy', 'signup']);
    expect(rollConversionsAcrossFlags([a, a], ['buy'], () => 0)).toEqual(['buy']);
  });

  it('ignores flags whose served variation is not configured', () => {
    expect(rollConversionsAcrossFlags([undefined, a], ['buy', 'signup'], () => 0.5)).toEqual(['buy']);
    expect(rollConversionsAcrossFlags([undefined], ['buy'], () => 0)).toEqual([]);
  });
});
