import { useEffect, useState } from 'react';
import type { RunStats, VariationConfig, VariationStats } from '../types';

interface Props {
  stats: RunStats | null;
  variations: VariationConfig[];
  eventKeys: string[];
  running: boolean;
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

export function StatsPanel({ stats, variations, eventKeys, running }: Props) {
  const [now, setNow] = useState(() => Date.now());
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
        <p className="muted">Start a run to see exposures and conversions per variation.</p>
      </section>
    );
  }

  const elapsed = Math.max(0, (stats.endedAt ?? now) - stats.startedAt);
  const perSec = elapsed > 0 ? (stats.contexts / (elapsed / 1000)).toFixed(2) : '—';
  const configured = new Map(variations.map((v) => [String(v.index), v]));
  const rows: [string, VariationStats][] = Object.entries(stats.byVariation).sort(([a], [b]) =>
    a === 'fallback' ? 1 : b === 'fallback' ? -1 : Number(a) - Number(b),
  );
  // Use the event keys the run started with, plus any that appear in results.
  const keys = [...new Set([...eventKeys, ...rows.flatMap(([, s]) => Object.keys(s.conversions))])];

  return (
    <section className="card">
      <div className="card-head">
        <h2>Live stats</h2>
        <span className="muted">
          {stats.contexts} contexts · {formatElapsed(elapsed)} · {perSec}/s
          {stats.errors > 0 && <span className="error-text"> · {stats.errors} errors</span>}
        </span>
      </div>
      <div className="table-scroll">
        <table className="stats">
          <thead>
            <tr>
              <th>Variation</th>
              <th className="num">Exposures</th>
              {keys.map((k) => (
                <th key={k} className="num">
                  <code>{k}</code>
                  <div className="muted small">actual / target</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([bucket, s]) => {
              const cfg = configured.get(bucket);
              return (
                <tr key={bucket} className={cfg ? '' : 'warn-row'}>
                  <td>
                    <div>
                      {bucket === 'fallback' ? 'Fallback value' : `${bucket} · ${cfg?.label || 'not configured'}`}
                    </div>
                    {s.value !== undefined && <code className="muted small">{JSON.stringify(s.value)}</code>}
                  </td>
                  <td className="num">{s.exposures}</td>
                  {keys.map((k) => {
                    const conv = s.conversions[k] ?? 0;
                    return (
                      <td key={k} className="num">
                        <div>
                          {conv} <span className="muted">({pct(conv, s.exposures)})</span>
                        </div>
                        <div className="muted small">target {cfg ? `${cfg.rates[k] ?? 0}%` : '—'}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some(([b]) => !configured.has(b) && stats.byVariation[b].exposures > 0) && (
        <p className="hint">
          Highlighted rows were served but have no configured rate, so they never convert. Check the flag is on and
          its variation indexes match.
        </p>
      )}
    </section>
  );
}
