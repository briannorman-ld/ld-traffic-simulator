import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, defaultFlag } from '../storage';
import type { RunStatus, SimConfig } from '../types';
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
  flags: [{ ...defaultFlag(), key: 'a' }],
  eventKeys: ['buy'],
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
