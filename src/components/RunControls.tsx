import { DEFAULT_MAX_RUN_MINUTES } from '../sim/engine';
import type { RunStatus } from '../types';
import { NumberField } from './NumberField';

interface Props {
  intervalMs: number;
  maxContexts: number | null;
  status: RunStatus;
  statusMessage: string | null;
  errors: string[];
  onIntervalMs: (v: number) => void;
  onMaxContexts: (v: number | null) => void;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'Idle',
  starting: 'Starting…',
  running: 'Running',
  stopping: 'Stopping…',
};

export function RunControls(p: Props) {
  const busy = p.status !== 'idle';
  return (
    <section className="card">
      <div className="card-head">
        <h2>Run</h2>
        <span className={`pill ${p.status}`}>{STATUS_LABEL[p.status]}</span>
      </div>
      <div className="row">
        <label>
          ms between calls
          <NumberField
            min={0}
            step={50}
            disabled={busy}
            value={p.intervalMs}
            onChange={(n) => n !== null && p.onIntervalMs(Math.max(0, n))}
          />
        </label>
        <label>
          Stop after (contexts)
          <NumberField
            min={1}
            step={1}
            allowEmpty
            placeholder={`empty = ${DEFAULT_MAX_RUN_MINUTES} min limit`}
            disabled={busy}
            value={p.maxContexts}
            onChange={p.onMaxContexts}
          />
        </label>
        <div className="row-end">
          {busy ? (
            <button type="button" className="danger-solid" disabled={p.status === 'stopping'} onClick={p.onStop}>
              Stop
            </button>
          ) : (
            <button type="button" className="primary" disabled={p.errors.length > 0} onClick={p.onStart}>
              Start
            </button>
          )}
        </div>
      </div>
      <p className="hint">
        Visitors run one at a time: the next starts this long after the previous one's events are flushed.
        {p.maxContexts === null && ` With no "stop after" count, the run stops on its own after ${DEFAULT_MAX_RUN_MINUTES} minutes.`}
      </p>
      {p.statusMessage && <p className="error-text">{p.statusMessage}</p>}
      {!busy && p.errors.length > 0 && (
        <ul className="errors">
          {p.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
