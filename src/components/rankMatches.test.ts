import { describe, expect, it } from 'vitest';
import { rankMatches } from './rankMatches';

const opts = [
  { value: 'proj-270', label: 'Checkout Web 270' },
  { value: 'proj-27', label: 'Platform Web 27' },
  { value: 'billing-ios', label: 'Billing iOS' },
  { value: 'growth', label: 'Growth', detail: 'growth team' },
];

describe('rankMatches', () => {
  it('puts exact key matches first', () => {
    expect(rankMatches(opts, 'proj-27').map((o) => o.value)).toEqual(['proj-27', 'proj-270']);
  });

  it('matches all terms in any order, case-insensitively', () => {
    expect(rankMatches(opts, 'ios billing').map((o) => o.value)).toEqual(['billing-ios']);
    expect(rankMatches(opts, 'web check').map((o) => o.value)).toEqual(['proj-270']);
  });

  it('returns nothing when a term is missing', () => {
    expect(rankMatches(opts, 'billing android')).toEqual([]);
  });
});
