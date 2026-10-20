import { useEffect, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { avgOccurrences } from '../sim/conversions';
import { ON_TARGET_PTS, targetGap } from '../sim/statsSummary';
import type { FlagConfig, RunStats, VariationConfig, VariationStats } from '../types';
import { variationStyle } from './variationColor';

interface Props {
  stats: RunStats | null;
  flags: FlagConfig[];
  running: boolean;
}

interface Bucket {
  key: string;
  stats: VariationStats;
  /** The variation's configured row, if any. */
  config: VariationConfig | undefined;
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

const sortBuckets = (byVariation: Record<string, VariationStats>): [string, VariationStats][] =>
  Object.entries(byVariation).sort(([a], [b]) =>
    a === 'fallback' ? 1 : b === 'fallback' ? -1 : Number(a) - Number(b),
  );

const normalizeOpen = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];

function VariationChip({ bucket }: { bucket: Bucket }) {
  const { stats: s, config } = bucket;
  return (
    <span className={`var-chip ${config ? '' : 'fallback'}`} style={variationStyle(s.index, !!config)}>
      <span className="var-index">{s.index ?? '?'}</span>
      {bucket.key === 'fallback' ? 'Fallback value' : config?.label || 'not configured'}
    </span>
  );
}

function Gap({ bucket, eventKeys }: { bucket: Bucket; eventKeys: string[] }) {
  if (bucket.stats.exposures === 0) return <span className="muted">no traffic</span>;
  if (!bucket.config) return <span className="gap off">no rates</span>;
  const gap = targetGap(bucket.stats, bucket.config, eventKeys);
  if (gap === null) return null;
  const rounded = Math.round(gap);
  const text = rounded === 0 ? 'on target' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} pts vs target`;
  return (
    <span
      className={`gap ${Math.abs(gap) <= ON_TARGET_PTS ? 'ok' : 'off'}`}
      title="Average of actual minus target conversion rate across event keys, in percentage points"
    >
      {text}
    </span>
  );
}

function FlagSummary({ buckets, eventKeys }: { buckets: Bucket[]; eventKeys: string[] }) {
  const total = buckets.reduce((n, b) => n + b.stats.exposures, 0);
  return (
    <>
      <div className="split-bar" aria-hidden>
        {buckets.map(
          (b) =>
            b.stats.exposures > 0 && (
              <span
                key={b.key}
                className={b.config ? '' : 'fallback'}
                style={{ ...variationStyle(b.stats.index, !!b.config), flexGrow: b.stats.exposures }}
              />
            ),
        )}
      </div>
      <ul className="split-list">
        {buckets.map((b) => (
          <li key={b.key}>
            <VariationChip bucket={b} />
            <span className="split-count">
              {b.stats.exposures.toLocaleString()} <span className="muted">· {pct(b.stats.exposures, total)}</span>
            </span>
            <Gap bucket={b} eventKeys={eventKeys} />
          </li>
        ))}
      </ul>
    </>
  );
}

function FlagTable({ buckets, eventKeys }: { buckets: Bucket[]; eventKeys: string[] }) {
  return (
    <div className="table-scroll">
      <table className="stats">
        <thead>
          <tr>
            <th>Variation</th>
            <th className="num">Exposures</th>
            {eventKeys.map((k) => (
              <th key={k} className="num">
                <code>{k}</code>
                <div className="muted small">sent · actual / target</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key} className={b.config ? '' : 'warn-row'}>
              <td>
                <VariationChip bucket={b} />
                {b.stats.value !== undefined && (
                  <div>
                    <code className="muted small">{JSON.stringify(b.stats.value)}</code>
                  </div>
                )}
              </td>
              <td className="num">{b.stats.exposures}</td>
              {eventKeys.map((k) => {
                const conv = b.stats.conversions[k] ?? 0;
                const occ = b.stats.occurrences[k] ?? 0;
                const rate = b.config ? (b.config.rates[k] ?? 0) : null;
                const avg = avgOccurrences(b.config, k);
                // Per-visitor numbers only add anything once an event can fire more than once.
                const counted = occ !== conv || avg !== 1;
                return (
                  <td key={k} className="num">
                    <div title="Track calls sent, counting every occurrence">
                      {occ.toLocaleString()} <span className="muted">sent</span>
                    </div>
                    <div className="muted small" title="Visitors who fired it at least once, vs the configured rate">
                      {pct(conv, b.stats.exposures)} fired · target {rate === null ? '—' : `${rate}%`}
                    </div>
                    {counted && (
                      <div className="muted small" title="Track calls per exposed visitor, vs rate × average">
                        {b.stats.exposures === 0 ? '—' : (occ / b.stats.exposures).toFixed(2)}/visitor · target{' '}
                        {rate === null ? '—' : ((rate / 100) * avg).toFixed(2)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatsPanel({ stats, flags, running }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = usePersistentState<string[]>('lts:statsOpen', normalizeOpen);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!stats) {
    return (
      <section className="card">
        <div className="card-head">
          <h2>Live stats</h2>
        </div>
        <p className="muted">Start a run to see exposures and conversions per flag variation.</p>
      </section>
    );
  }

  const elapsed = Math.max(0, (stats.endedAt ?? now) - stats.startedAt);
  const perSec = elapsed > 0 ? (stats.contexts / (elapsed / 1000)).toFixed(2) : '—';
  const flagStats = Object.entries(stats.byFlag).map(([flagKey, byVariation]) => {
    const flag = flags.find((f) => f.key.trim() === flagKey);
    const buckets: Bucket[] = sortBuckets(byVariation).map(([key, s]) => ({
      key,
      stats: s,
      config: flag?.variations.find((v) => String(v.index) === key),
    }));
    // The flag's own events, plus any that appear in its results.
    const eventKeys = [
      ...new Set([...(flag?.eventKeys ?? []), ...buckets.flatMap((b) => Object.keys(b.stats.conversions))]),
    ];
    return { flagKey, buckets, eventKeys };
  });
  const unconfiguredServed = flagStats.some((f) => f.buckets.some((b) => !b.config && b.stats.exposures > 0));
  const allOpen = flagStats.every((f) => open.includes(f.flagKey));
  const toggle = (key: string) => setOpen(open.includes(key) ? open.filter((k) => k !== key) : [...open, key]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Live stats</h2>
        <span className="muted">
          {stats.contexts} contexts · {formatElapsed(elapsed)} · {perSec}/s
          {stats.errors > 0 && <span className="error-text"> · {stats.errors} errors</span>}
        </span>
        <button
          type="button"
          className="link push-right"
          onClick={() =>
            setOpen(
              allOpen
                ? open.filter((k) => !flagStats.some((f) => f.flagKey === k))
                : [...new Set([...open, ...flagStats.map((f) => f.flagKey)])],
            )
          }
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {flagStats.map(({ flagKey, buckets, eventKeys }) => {
        const isOpen = open.includes(flagKey);
        const exposures = buckets.reduce((n, b) => n + b.stats.exposures, 0);
        return (
          <div key={flagKey} className={`stats-flag ${isOpen ? 'open' : ''}`}>
            <button type="button" className="stats-flag-head" aria-expanded={isOpen} onClick={() => toggle(flagKey)}>
              <span className="caret" aria-hidden>
                ▸
              </span>
              <code className="stats-flag-key">{flagKey}</code>
              <span className="muted push-right">{exposures.toLocaleString()} exposures</span>
            </button>
            <FlagSummary buckets={buckets} eventKeys={eventKeys} />
            {isOpen && <FlagTable buckets={buckets} eventKeys={eventKeys} />}
          </div>
        );
      })}

      {unconfiguredServed && (
        <p className="hint">
          Variations marked “no rates” were served but aren't in the flag's rates table, so they never convert. Check
          the flag is on and its variation indexes match.
        </p>
      )}
    </section>
  );
}
