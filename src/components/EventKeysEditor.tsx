import { useId, useState } from 'react';
import type { LdMetric } from '../api/ldApi';

interface Props {
  eventKeys: string[];
  metrics: LdMetric[] | null;
  /** Event keys other flags already use -> that flag's label. An event belongs to one flag. */
  taken: Map<string, string>;
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
}

/** One flag's event keys: chips plus an input that suggests the project's custom metrics. */
export function EventKeysEditor({ eventKeys, metrics, taken, onAdd, onRemove }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const nameFor = (key: string) =>
    metrics
      ?.filter((m) => m.eventKey === key)
      .map((m) => m.name)
      .join(', ');
  const suggestions = metrics?.filter((m) => !eventKeys.includes(m.eventKey) && !taken.has(m.eventKey)) ?? [];

  function add(value = text) {
    const key = value.trim();
    if (!key) return;
    const owner = taken.get(key);
    if (owner) {
      setError(`"${key}" is already used by ${owner}. Each event belongs to one flag.`);
      return;
    }
    if (!eventKeys.includes(key)) onAdd(key);
    setText('');
    setError(null);
  }

  return (
    <div className="event-keys">
      <div className="chips">
        <span className="muted small">Events</span>
        {eventKeys.length === 0 && <span className="muted small">none yet</span>}
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
          aria-label="Add event key"
          spellCheck={false}
          list={listId}
          placeholder={metrics ? 'Type or pick a metric event key' : 'Add an event key, e.g. checkout-completed'}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setError(null);
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
        <datalist id={listId}>
          {suggestions.map((m) => (
            <option key={m.key} value={m.eventKey}>
              {m.name}
            </option>
          ))}
        </datalist>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
