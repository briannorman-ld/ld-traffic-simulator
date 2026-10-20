import { describe, expect, it } from 'vitest';
import { defaultConfig, defaultFlag, normalizeConfig, normalizeSaved } from './storage';
import type { SimConfig } from './types';
import { validateConfig } from './validation';

const valid = (): SimConfig => ({
  ...defaultConfig(),
  clientSideId: 'abc123',
  flags: [{ ...defaultFlag(), key: 'my-flag' }],
  eventKeys: ['buy'],
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
      eventKeys: ['ok', 5],
      flags: [{ key: 'f', variations: [{ index: 1, rates: { a: 10, b: 'x' } }, null] }, 'junk'],
      maxContexts: -3,
      api: { token: { iv: 1 } },
    });
    expect(c.eventKeys).toEqual(['ok']);
    expect(c.flags).toHaveLength(1);
    expect(c.flags[0].variations).toHaveLength(1);
    expect(c.flags[0].variations[0].rates).toEqual({ a: 10 });
    expect(c.maxContexts).toBeNull();
    expect(c.api.token).toBeNull();
  });

  it('migrates configs saved with a single top-level flag', () => {
    const c = normalizeConfig({ flagKey: 'old-flag', variations: [{ index: 0, label: 'A', rates: { buy: 5 } }] });
    expect(c.flags).toHaveLength(1);
    expect(c.flags[0].key).toBe('old-flag');
    expect(c.flags[0].variations).toMatchObject([{ index: 0, label: 'A', rates: { buy: 5 } }]);
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
    c.flags.push({ ...defaultFlag(), key: '' }, { ...defaultFlag(), key: 'my-flag' });
    c.flags[2].variations[0].rates = { buy: -1 };
    const errs = validateConfig(c);
    expect(errs).toContain('Flag #2 needs a key.');
    expect(errs).toContain('Flag "my-flag" is listed twice.');
    expect(errs).toContain('Rate for "Control" on "my-flag" on "buy" must be 0–100.');
  });

  it('requires at least one flag', () => {
    expect(validateConfig({ ...valid(), flags: [] })).toContain('Add at least one flag.');
  });
});
