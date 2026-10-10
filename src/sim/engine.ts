import { createClient, type LDClient, type LDLogger } from '@launchdarkly/js-client-sdk';
import type { RunStats, RunStatus, SimConfig } from '../types';
import { buildContext, describeContext } from './contextBuilder';
import { rollConversions } from './conversions';
import { logStore } from './logStore';
import { setLoggedFlagKey } from './networkLog';

/** Runs without a "stop after" count end on their own after this long. */
export const DEFAULT_MAX_RUN_MINUTES = 30;

export interface RunnerCallbacks {
  onStatus(status: RunStatus, message?: string): void;
  onStats(stats: RunStats): void;
}

const sdkLogger: LDLogger = {
  error: (...args) => logStore.add({ category: 'sdk', level: 'error', title: args.join(' ') }),
  warn: (...args) => logStore.add({ category: 'sdk', level: 'warn', title: args.join(' ') }),
  info: () => {},
  debug: () => {},
};

/**
 * Simulates visitors one at a time: identify → evaluate → track conversions → flush,
 * then waits `intervalMs` before the next visitor.
 */
export class SimulationRunner {
  private readonly config: SimConfig;
  private readonly cb: RunnerCallbacks;
  private stopRequested = false;
  private wake: (() => void) | null = null;

  constructor(config: SimConfig, cb: RunnerCallbacks) {
    this.config = config;
    this.cb = cb;
  }

  stop() {
    this.stopRequested = true;
    this.wake?.();
    this.cb.onStatus('stopping');
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        resolve();
      }
      this.wake = done;
    }).finally(() => {
      this.wake = null;
    });
  }

  async run(): Promise<void> {
    const cfg = this.config;
    const flagKey = cfg.flagKey.trim();
    const stats: RunStats = {
      startedAt: Date.now(),
      endedAt: null,
      contexts: 0,
      errors: 0,
      byVariation: {},
    };
    for (const v of cfg.variations) {
      stats.byVariation[String(v.index)] = { index: v.index, value: undefined, exposures: 0, conversions: {} };
    }
    const emit = () => this.cb.onStats(structuredClone(stats));
    emit();

    setLoggedFlagKey(flagKey);
    this.cb.onStatus('starting');
    logStore.add({
      category: 'run',
      level: 'info',
      title: 'Run started',
      summary: `${flagKey} · ${cfg.eventKeys.join(', ')} · every ${cfg.intervalMs} ms · ${
        cfg.maxContexts ? `stop after ${cfg.maxContexts}` : `stop after ${DEFAULT_MAX_RUN_MINUTES} min`
      }`,
      details: { ...cfg, api: undefined },
    });

    let client: LDClient | null = null;
    let endMessage = 'Run stopped';
    const deadline = cfg.maxContexts === null ? stats.startedAt + DEFAULT_MAX_RUN_MINUTES * 60_000 : null;
    // Never wait past the deadline, even with a long interval.
    const pause = () =>
      this.sleep(deadline === null ? cfg.intervalMs : Math.min(cfg.intervalMs, Math.max(0, deadline - Date.now())));
    let endLevel: 'info' | 'error' = 'info';

    try {
      let context = buildContext(cfg.contextKinds);
      client = createClient(cfg.clientSideId.trim(), context, {
        streaming: false,
        withReasons: true,
        fetchGoals: false,
        disableCache: true,
        logger: sdkLogger,
      });
      const init = await client.start({ timeout: 10 });
      if (init.status === 'failed') {
        const hint = /\b40[13]\b/.test(init.error.message) ? ' (check the client-side ID)' : '';
        throw new Error(`SDK failed to initialize: ${init.error.message}${hint}`);
      }
      if (init.status === 'timeout') throw new Error('SDK initialization timed out after 10s');
      this.cb.onStatus('running');

      let first = true;
      while (!this.stopRequested) {
        if (deadline !== null && Date.now() >= deadline) {
          endMessage = `Run stopped after ${DEFAULT_MAX_RUN_MINUTES} minutes (no "stop after" count set)`;
          break;
        }
        if (!first) {
          context = buildContext(cfg.contextKinds);
          const result = await client.identify(context, { sheddable: false });
          if (result.status !== 'completed') {
            stats.errors++;
            emit();
            logStore.add({
              category: 'visitor',
              level: 'error',
              title: `Identify ${result.status} for ${describeContext(context)}`,
              details: { context, result: result.status === 'error' ? String(result.error) : result },
            });
            if (!this.stopRequested) await pause();
            continue;
          }
        }
        first = false;

        const detail = client.variationDetail(flagKey, null);
        if (detail.reason?.kind === 'ERROR' && detail.reason.errorKind === 'FLAG_NOT_FOUND') {
          throw new Error(`Flag "${flagKey}" was not found in this environment`);
        }

        const idx = detail.variationIndex ?? null;
        const bucketKey = idx === null ? 'fallback' : String(idx);
        const bucket = (stats.byVariation[bucketKey] ??= {
          index: idx,
          value: detail.value,
          exposures: 0,
          conversions: {},
        });
        bucket.value = detail.value;
        bucket.exposures++;

        const variation = idx === null ? undefined : cfg.variations.find((v) => v.index === idx);
        const converted = rollConversions(variation, cfg.eventKeys);
        for (const key of converted) {
          client.track(key);
          bucket.conversions[key] = (bucket.conversions[key] ?? 0) + 1;
        }
        await client.flush();

        stats.contexts++;
        emit();
        logStore.add({
          category: 'visitor',
          level: variation ? 'info' : 'warn',
          title: `Visitor #${stats.contexts} ${describeContext(context)}`,
          summary: `variation ${idx ?? 'fallback'} (${JSON.stringify(detail.value)})${variation ? '' : ' — not configured'} · ${
            converted.length ? `converted: ${converted.join(', ')}` : 'no conversions'
          }`,
          details: { context, evaluation: detail, converted },
        });

        if (cfg.maxContexts !== null && stats.contexts >= cfg.maxContexts) {
          endMessage = `Run finished after ${stats.contexts} contexts`;
          break;
        }
        if (!this.stopRequested) await pause();
      }
    } catch (err) {
      endLevel = 'error';
      endMessage = err instanceof Error ? err.message : String(err);
      stats.errors++;
    } finally {
      if (client) {
        await client.flush().catch(() => undefined);
        await client.close().catch(() => undefined);
      }
      stats.endedAt = Date.now();
      emit();
      logStore.add({ category: 'run', level: endLevel, title: endMessage, summary: `${stats.contexts} contexts sent` });
      this.cb.onStatus('idle', endLevel === 'error' ? endMessage : undefined);
    }
  }
}
