import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, defaultFlag } from '../storage';
import type { RunStats, RunStatus, SimConfig } from '../types';
import { SimulationRunner } from './engine';

const sdk = vi.hoisted(() => ({
  client: null as null | Record<string, ReturnType<typeof vi.fn>>,
  initStatus: 'complete' as string,
  flagFound: true,
}));

vi.mock('@launchdarkly/js-client-sdk', () => ({
  createClient: () => {
    sdk.client = {
      start: vi.fn(async () =>
        sdk.initStatus === 'failed' ? { status: 'failed', error: new Error('401') } : { status: sdk.initStatus },
      ),
      identify: vi.fn(async () => ({ status: 'completed' })),
      variationDetail: vi.fn(() =>
        sdk.flagFound
          ? { value: true, variationIndex: 0, reason: { kind: 'FALLTHROUGH' } }
          : { value: null, reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } },
      ),
      track: vi.fn(),
      flush: vi.fn(async () => ({ result: true })),
      close: vi.fn(async () => undefined),
    };
    return sdk.client;
  },
}));

const config = (over: Partial<SimConfig> = {}): SimConfig => ({
  ...defaultConfig(),
  clientSideId: 'abc',
  flags: [{ ...defaultFlag(), key: 'a', eventKeys: ['buy'] }],
  ...over,
});

function start(cfg: SimConfig) {
  const statuses: RunStatus[] = [];
  const runner = new SimulationRunner(cfg, { onStatus: (s) => statuses.push(s), onStats: () => {} });
  return { runner, statuses, done: runner.run() };
}

/** Lets the runner reach its pause between visitors. */
const settle = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  sdk.client = null;
  sdk.initStatus = 'complete';
  sdk.flagFound = true;
});

describe('SimulationRunner conversions', () => {
  it("tracks each flag's own events and credits only that flag", async () => {
    const flag = (key: string, eventKeys: string[], rates: Record<string, number>) => ({
      ...defaultFlag(),
      key,
      eventKeys,
      variations: [{ id: key, index: 0, label: 'A', rates }],
    });
    let last: RunStats | null = null;
    const runner = new SimulationRunner(
      config({ maxContexts: 1, flags: [flag('a', ['buy'], { buy: 100 }), flag('b', ['view'], { view: 100 })] }),
      { onStatus: () => {}, onStats: (s) => (last = s) },
    );
    await runner.run();
    expect(sdk.client!.track.mock.calls).toEqual([['buy'], ['view']]);
    expect(last!.byFlag.a['0'].conversions).toEqual({ buy: 1 });
    expect(last!.byFlag.b['0'].conversions).toEqual({ view: 1 });
  });
});

describe('SimulationRunner occurrences', () => {
  const run = async (rate: number, occurrences: Record<string, number> | undefined, visitors: number) => {
    let last: RunStats | null = null;
    const flag = {
      ...defaultFlag(),
      key: 'a',
      eventKeys: ['view'],
      variations: [{ id: 'v', index: 0, label: 'A', rates: { view: rate }, ...(occurrences && { occurrences }) }],
    };
    await new SimulationRunner(config({ maxContexts: visitors, intervalMs: 0, flags: [flag] }), {
      onStatus: () => {},
      onStats: (s) => (last = s),
    }).run();
    return { tracks: sdk.client!.track.mock.calls, stats: last!.byFlag.a['0'] };
  };

  it('sends one track call per occurrence, about 3 per visitor at 100% with an average of 3', async () => {
    const { tracks, stats } = await run(100, { view: 3 }, 1000);
    expect(tracks.every((c) => c.length === 1 && c[0] === 'view')).toBe(true);
    expect(tracks.length / 1000).toBeGreaterThan(2.7);
    expect(tracks.length / 1000).toBeLessThan(3.3);
    expect(stats.conversions.view).toBe(1000);
    expect(stats.occurrences.view).toBe(tracks.length);
  });

  it('tracks after evaluating and before flushing each visitor', async () => {
    await run(100, { view: 3 }, 1);
    const c = sdk.client!;
    const tracked = c.track.mock.invocationCallOrder;
    expect(Math.min(...tracked)).toBeGreaterThan(c.variationDetail.mock.invocationCallOrder[0]);
    expect(Math.max(...tracked)).toBeLessThan(c.flush.mock.invocationCallOrder[0]);
  });

  it('sends nothing at a rate of 0, whatever the average', async () => {
    const { tracks, stats } = await run(0, { view: 5 }, 50);
    expect(tracks).toEqual([]);
    expect(stats.occurrences).toEqual({});
  });

  it('sends exactly one call per converting visitor when no average is set', async () => {
    const { tracks, stats } = await run(100, undefined, 20);
    expect(tracks).toHaveLength(20);
    expect(stats.occurrences.view).toBe(20);
  });
});

describe('SimulationRunner shutdown', () => {
  it('stops during the pause between visitors and closes the client', async () => {
    const { runner, statuses, done } = start(config({ intervalMs: 60_000 }));
    await settle();
    runner.stop();
    await done;
    expect(sdk.client!.identify).not.toHaveBeenCalled(); // never reached visitor #2
    expect(sdk.client!.close).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('idle');
  });

  it('ignores stop() after the run has ended', async () => {
    const { runner, statuses, done } = start(config({ maxContexts: 1 }));
    await done;
    runner.stop();
    runner.stop();
    expect(statuses.at(-1)).toBe('idle');
    expect(statuses).not.toContain('stopping');
    expect(sdk.client!.close).toHaveBeenCalledTimes(1);
  });

  it('closes the client when the "stop after" count is reached', async () => {
    const { done } = start(config({ maxContexts: 3, intervalMs: 0 }));
    await done;
    expect(sdk.client!.identify).toHaveBeenCalledTimes(2); // the first visitor uses the initial context
    expect(sdk.client!.close).toHaveBeenCalledTimes(1);
  });

  it('closes the client when initialization fails', async () => {
    sdk.initStatus = 'failed';
    const { done, statuses } = start(config());
    await done;
    expect(sdk.client!.close).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('idle');
  });

  it('closes the client when a flag is missing', async () => {
    sdk.flagFound = false;
    const { done } = start(config());
    await done;
    expect(sdk.client!.track).not.toHaveBeenCalled();
    expect(sdk.client!.close).toHaveBeenCalledTimes(1);
  });
});
