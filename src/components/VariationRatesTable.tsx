import { randomizeRates } from '../sim/randomRates';
import type { VariationConfig } from '../types';
import { uid } from '../uid';
import { NumberField } from './NumberField';

interface Props {
  variations: VariationConfig[];
  eventKeys: string[];
  /** True when flags are loaded from the API, so picking one auto-fills this table. */
  apiFlagsAvailable: boolean;
  onChange: (variations: VariationConfig[]) => void;
}

export function VariationRatesTable({ variations, eventKeys, apiFlagsAvailable, onChange }: Props) {
  const update = (id: string, patch: Partial<VariationConfig>) =>
    onChange(variations.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const setRate = (v: VariationConfig, key: string, rate: number | null) =>
    update(v.id, { rates: { ...v.rates, [key]: rate ?? 0 } });

  return (
    <section className="card">
      <div className="card-head">
        <h2>Variations &amp; conversion rates</h2>
        <span className="muted">% of visitors served each variation who fire each event</span>
        <button
          type="button"
          className="link push-right"
          disabled={eventKeys.length === 0 || variations.length === 0}
          title="Random rates from 5–40% per event, with variations within 10% (relative) of each other"
          onClick={() => onChange(randomizeRates(variations, eventKeys))}
        >
          Randomize rates
        </button>
      </div>
      <p className="hint">
        Index is the variation's position in the flag (0 = first).
        {apiFlagsAvailable && ' Picking a flag above fills these in; rates you already entered are kept by index.'}
      </p>

      <div className="table-scroll">
        <table className="rates">
          <thead>
            <tr>
              <th>Index</th>
              <th>Label</th>
              {eventKeys.map((k) => (
                <th key={k}>
                  <code>{k}</code>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {variations.map((v) => (
              <tr key={v.id}>
                <td>
                  <NumberField
                    className="index-input"
                    aria-label="Variation index"
                    min={0}
                    step={1}
                    value={v.index}
                    onChange={(n) => n !== null && update(v.id, { index: n })}
                  />
                </td>
                <td>
                  <input
                    className="label-input"
                    aria-label="Variation label"
                    title={v.label}
                    value={v.label}
                    placeholder="label"
                    onChange={(e) => update(v.id, { label: e.target.value })}
                  />
                </td>
                {eventKeys.map((k) => (
                  <td key={k}>
                    <span className="pct">
                      <NumberField
                        className="narrow"
                        min={0}
                        max={100}
                        step={0.1}
                        value={v.rates[k] ?? 0}
                        onChange={(n) => setRate(v, k, n)}
                      />
                      %
                    </span>
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="icon"
                    aria-label="Remove variation"
                    onClick={() => onChange(variations.filter((x) => x.id !== v.id))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {eventKeys.length === 0 && <p className="hint">Add an event key to set conversion rates.</p>}
      <div className="row">
        <button
          type="button"
          onClick={() => {
            const next = variations.reduce((m, v) => Math.max(m, v.index + 1), 0);
            onChange([...variations, { id: uid(), index: next, label: `Variation ${next}`, rates: {} }]);
          }}
        >
          + Add variation
        </button>
      </div>
    </section>
  );
}
