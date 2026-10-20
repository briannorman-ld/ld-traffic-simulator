import { describe, expect, it } from 'vitest';
import { avgOccurrences, rollConversions, rollEvents } from './sim/conversions';
import { defaultConfig, defaultFlag, normalizeConfig, normalizeSaved } from './storage';
import type { SimConfig } from './types';
import { validateConfig } from './validation';

const valid = (): SimConfig => ({
  ...defaultConfig(),
  clientSideId: 'abc123',
  flags: [{ ...defaultFlag(), key: 'my-flag', eventKeys: ['buy'] }],
});

describe('normalizeConfig', () => {
  it('returns defaults for missing or corrupt data', () => {
    expect(normalizeConfig(undefined).intervalMs).toBe(500);
    expect(normalizeConfig('nonsense').contextKinds[0].kind).toBe('user');
  });

  it('round-trips a valid config', () => {
    const c = valid();
    expect(normalizeConfig(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it('drops malformed fields', () => {
    const c = normalizeConfig({
      flags: [{ key: 'f', eventKeys: ['ok', 5], variations: [{ index: 1, rates: { a: 10, b: 'x' } }, null] }, 'junk'],
      maxContexts: -3,
      api: { token: { iv: 1 } },
    });
    expect(c.flags).toHaveLength(1);
    expect(c.flags[0].eventKeys).toEqual(['ok']);
    expect(c.flags[0].variations).toHaveLength(1);
    expect(c.flags[0].variations[0].rates).toEqual({ a: 10 });
    expect(c.maxContexts).toBeNull();
    expect(c.api.token).toBeNull();
  });

  it('migrates configs saved with a single top-level flag', () => {
    const c = normalizeConfig({
      flagKey: 'old-flag',
      eventKeys: ['buy'],
      variations: [{ index: 0, label: 'A', rates: { buy: 5 } }],
    });
    expect(c.flags).toHaveLength(1);
    expect(c.flags[0].key).toBe('old-flag');
    expect(c.flags[0].eventKeys).toEqual(['buy']);
    expect(c.flags[0].variations).toMatchObject([{ index: 0, label: 'A', rates: { buy: 5 } }]);
  });

  it('moves a shared event list onto the first flag with a rate for each event', () => {
    const c = normalizeConfig({
      eventKeys: ['buy', 'view', 'signup'],
      flags: [
        { key: 'a', variations: [{ index: 0, rates: { buy: 0, view: 10 } }] },
        { key: 'b', variations: [{ index: 0, rates: { buy: 20 } }] },
      ],
    });
    expect(c.flags.map((f) => f.eventKeys)).toEqual([['view', 'signup'], ['buy']]);
  });

  it('loads configs saved before averages existed and behaves as before', () => {
    const [saved] = normalizeSaved([
      {
        id: 's1',
        name: 'old',
        config: {
          clientSideId: 'abc',
          flags: [{ key: 'f', eventKeys: ['buy'], variations: [{ index: 0, label: 'A', rates: { buy: 40 } }] }],
        },
      },
    ]);
    const v = saved.config.flags[0].variations[0];
    expect(v.occurrences).toBeUndefined();
    expect(avgOccurrences(v, 'buy')).toBe(1);
    expect(validateConfig(saved.config)).toEqual([]);
    for (const roll of [0.1, 0.39, 0.4, 0.9]) {
      expect(rollEvents(v, ['buy'], () => roll)).toEqual(
        rollConversions(v, ['buy'], () => roll).map((key) => ({ key, count: 1 })),
      );
    }
  });

  it('round-trips averages and drops malformed ones', () => {
    const c = valid();
    c.flags[0].variations[0].occurrences = { buy: 3.9 };
    expect(normalizeConfig(JSON.parse(JSON.stringify(c)))).toEqual(c);
    const bad = normalizeConfig({ flags: [{ variations: [{ occurrences: { a: 2, b: 'x', c: null } }] }] });
    expect(bad.flags[0].variations[0].occurrences).toEqual({ a: 2 });
  });

  it('normalizes saved config lists', () => {
    const saved = normalizeSaved([{ id: 's1', name: 'A', config: valid() }, 'junk']);
    expect(saved).toHaveLength(1);
    expect(saved[0].config.flags[0].key).toBe('my-flag');
  });
});

describe('validateConfig', () => {
  it('accepts a complete config', () => {
    expect(validateConfig(valid())).toEqual([]);
  });

  it('requires the basics', () => {
    const errs = validateConfig(defaultConfig());
    expect(errs).toContain('Client-side ID is required.');
    expect(errs).toContain('Flag key is required.');
    expect(errs).toContain('Add at least one event key.');
  });

  it('rejects bad kinds, attributes, indexes and rates', () => {
    const c = valid();
    c.contextKinds = [
      { id: '1', kind: 'multi', keyPrefix: '', anonymous: false, attributes: [] },
      {
        id: '2',
        kind: 'user',
        keyPrefix: '',
        anonymous: false,
        attributes: [
          { id: 'a', name: 'key', value: 'x', type: 'string' },
          { id: 'b', name: 'n', value: 'abc', type: 'number' },
        ],
      },
    ];
    c.flags[0].variations = [
      { id: 'v1', index: 0, label: 'A', rates: { buy: 120 } },
      { id: 'v2', index: 0, label: 'B', rates: {} },
    ];
    const errs = validateConfig(c).join('\n');
    expect(errs).toMatch(/"multi" is invalid/);
    expect(errs).toMatch(/"key" is reserved/);
    expect(errs).toMatch(/must be a number/);
    expect(errs).toMatch(/index 0 is listed twice/);
    expect(errs).toMatch(/must be 0–100/);
  });

  it('checks every flag and names it when there are several', () => {
    const c = valid();
    c.flags.push({ ...defaultFlag(), key: '' }, { ...defaultFlag(), key: 'other', eventKeys: ['view'] });
    c.flags[2].variations[0].rates = { view: -1 };
    const errs = validateConfig(c);
    expect(errs).toContain('Flag #2 needs a key.');
    expect(errs).toContain('Rate for "Control" on "other" on "view" must be 0–100.');
    c.flags[2].key = 'my-flag';
    expect(validateConfig(c)).toContain('Flag "my-flag" is listed twice.');
  });

  it('allows each event on one flag only', () => {
    const c = valid();
    c.flags.push({ ...defaultFlag(), key: 'other', eventKeys: ['buy'] });
    expect(validateConfig(c)).toContain('Event "buy" is used by both "my-flag" and "other".');
  });

  it('requires averages of 1 or more on events that can fire', () => {
    const c = valid();
    c.flags[0].variations[0].rates = { buy: 50 };
    c.flags[0].variations[0].occurrences = { buy: 0.5 };
    expect(validateConfig(c)).toContain('Average per visitor for "Control" on "buy" must be 1 or more.');
    c.flags[0].variations[0].rates = { buy: 0 }; // the input is disabled at 0%
    expect(validateConfig(c)).toEqual([]);
  });

  it('requires at least one flag', () => {
    expect(validateConfig({ ...valid(), flags: [] })).toContain('Add at least one flag.');
  });
});
