import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logStore } from './logStore';

describe('logStore', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    logStore.clear();
  });

  it('caps entries but keeps running totals per category', () => {
    for (let i = 0; i < 1500; i++) logStore.add({ category: 'visitor', level: 'info', title: `v${i}`, time: i + 1 });
    const { entries, totals, totalAdded } = logStore.getSnapshot();
    expect(entries).toHaveLength(logStore.maxEntries);
    expect(entries[0].title).toBe('v1499');
    expect(totals.visitor).toBe(1500);
    expect(totalAdded).toBe(1500);
  });

  it('never drops run entries when trimming', () => {
    logStore.add({ category: 'run', level: 'info', title: 'Run started', time: 0 });
    for (let i = 0; i < 1500; i++) logStore.add({ category: 'events', level: 'info', title: `e${i}`, time: i + 1 });
    const { entries, totals } = logStore.getSnapshot();
    expect(entries).toHaveLength(logStore.maxEntries);
    expect(entries.at(-1)?.title).toBe('Run started');
    expect(totals.run).toBe(1);
    expect(totals.events).toBe(1500);
  });

  it('clear resets entries and totals', () => {
    logStore.add({ category: 'sdk', level: 'warn', title: 'x' });
    logStore.clear();
    expect(logStore.getSnapshot()).toEqual({ entries: [], totals: {}, totalAdded: 0 });
  });
});
