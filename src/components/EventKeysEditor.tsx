import { useState } from 'react';
import type { LdMetric } from '../api/ldApi';

interface Props {
  eventKeys: string[];
  metrics: LdMetric[] | null;
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
}

export function EventKeysEditor({ eventKeys, metrics, onAdd, onRemove }: Props) {
  const [text, setText] = useState('');
  const nameFor = (key: string) =>
    metrics
      ?.filter((m) => m.eventKey === key)
      .map((m) => m.name)
      .join(', ');
  const suggestions = metrics?.filter((m) => !eventKeys.includes(m.eventKey)) ?? [];

  function add(value = text) {
    const key = value.trim();
    if (key && !eventKeys.includes(key)) onAdd(key);
    setText('');
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Event keys</h2>
        <span className="muted">each is rolled on its own for every visitor</span>
      </div>
      <div className="chips">
        {eventKeys.length === 0 && <span className="muted">No event keys yet.</span>}
        {eventKeys.map((key) => (
          <span key={key} className="chip" title={nameFor(key) || undefined}>
            <code>{key}</code>
            {nameFor(key) && <span className="muted"> · {nameFor(key)}</span>}
            <button type="button" aria-label={`Remove ${key}`} onClick={() => onRemove(key)}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row">
        <input
          className="grow"
          spellCheck={false}
          list="metric-options"
          placeholder={metrics ? 'Type or pick a metric event key' : 'e.g. checkout-completed'}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            // Picking from the datalist fills in a full metric event key: add it right away.
            if (suggestions.some((m) => m.eventKey === v) && v.length - text.length > 1) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" disabled={!text.trim()} onClick={() => add()}>
          Add
        </button>
        <datalist id="metric-options">
          {suggestions.map((m) => (
            <option key={m.key} value={m.eventKey}>
              {m.name}
            </option>
          ))}
        </datalist>
      </div>
    </section>
  );
}
