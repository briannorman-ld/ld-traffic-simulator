import { useState, useSyncExternalStore } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { logStore } from '../sim/logStore';
import type { LogCategory, LogEntry, VisitFlag, VisitSummary } from '../types';
import { variationStyle } from './variationColor';

const CATEGORIES: { key: LogCategory; label: string }[] = [
  { key: 'run', label: 'Run' },
  { key: 'visitor', label: 'Visitors' },
  { key: 'evaluation', label: 'Evaluations' },
  { key: 'events', label: 'Event batches' },
  { key: 'diagnostic', label: 'Diagnostics' },
  { key: 'sdk', label: 'SDK messages' },
  { key: 'api', label: 'REST API' },
  { key: 'goals', label: 'Goals' },
  { key: 'network', label: 'Other' },
];

const normalizeHidden = (raw: unknown): LogCategory[] =>
  Array.isArray(raw) ? raw.filter((c): c is LogCategory => CATEGORIES.some((x) => x.key === c)) : [];

function time(t: number) {
  const d = new Date(t);
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function VariationChip({ flag, showKey }: { flag: VisitFlag; showKey: boolean }) {
  const idx = flag.variationIndex;
  return (
    <span
      className={`var-chip ${flag.configured ? '' : 'fallback'}`}
      style={variationStyle(idx, flag.configured)}
      title={`${flag.flagKey}: ${flag.configured ? `variation ${idx}` : 'served variation is not in the rates table'}`}
    >
      <span className="var-index">{idx ?? '?'}</span>
      {showKey && <span className="var-flag">{flag.flagKey}</span>}
      {flag.label}
      {!flag.configured && ' · not configured'}
    </span>
  );
}

function VisitLine({ visit }: { visit: VisitSummary }) {
  return (
    <>
      <span className="log-visit">Visitor #{visit.number}</span>
      <span className="visit-line">
        {visit.flags.map((f) => (
          <VariationChip key={f.flagKey} flag={f} showKey={visit.flags.length > 1} />
        ))}
        {visit.events.length > 0 && <span className="visit-sep" aria-hidden />}
        {visit.events.map((e) => (
          <span key={e.key} className={`conv-chip ${e.converted ? 'hit' : ''}`} title={e.converted ? 'Converted' : 'Did not convert'}>
            <span className="mark" aria-hidden>
              {e.converted ? '✓' : '·'}
            </span>
            {e.key}
          </span>
        ))}
      </span>
    </>
  );
}

function Row({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = open && entry.details !== undefined ? JSON.stringify(entry.details, null, 2) : '';
  return (
    <li className={`log-row ${entry.level}`}>
      <button type="button" className="log-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="log-time">{time(entry.time)}</span>
        <span className={`badge ${entry.category}`}>{entry.category}</span>
        {entry.visit ? (
          <VisitLine visit={entry.visit} />
        ) : (
          <>
            <span className="log-title">{entry.title}</span>
            {entry.summary && <span className="log-summary">{entry.summary}</span>}
          </>
        )}
      </button>
      {open && entry.details !== undefined && (
        <div className="log-body">
          <button
            type="button"
            className="link copy"
            onClick={() => {
              void navigator.clipboard?.writeText(json).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <pre className="json">{json}</pre>
        </div>
      )}
    </li>
  );
}

export function EventLog() {
  const { entries, totals, totalAdded } = useSyncExternalStore(logStore.subscribe, logStore.getSnapshot);
  const [hidden, setHidden] = usePersistentState<LogCategory[]>('lts:logHidden', normalizeHidden);
  const visible = entries.filter((e) => !hidden.includes(e.category));
  const toggle = (c: LogCategory) => setHidden(hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c]);

  return (
    <section className="card log">
      <div className="card-head">
        <h2>Event log</h2>
        <span className="muted">
          {visible.length} shown
          {totalAdded > entries.length
            ? ` · newest ${entries.length.toLocaleString()} of ${totalAdded.toLocaleString()} kept`
            : ` · keeps the newest ${logStore.maxEntries.toLocaleString()}`}{' '}
          · clears on refresh
        </span>
        <button type="button" className="link" onClick={() => logStore.clear()}>
          Clear
        </button>
      </div>
      <div className="filters">
        {CATEGORIES.map((c) => (
          <label key={c.key} className={`filter ${hidden.includes(c.key) ? 'off' : ''}`}>
            <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggle(c.key)} />
            <span className={`badge ${c.key}`}>{c.label}</span>
            <span className="muted small" title="Total since last clear, including entries no longer kept">
              {(totals[c.key] ?? 0).toLocaleString()}
            </span>
          </label>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="muted">Nothing logged yet. Every request the SDK makes shows up here; click a row to see its payload.</p>
      ) : (
        <ol className="log-list">
          {visible.map((e) => (
            <Row key={e.id} entry={e} />
          ))}
        </ol>
      )}
    </section>
  );
}
