import type { VariationConfig } from '../types';
import { uid } from '../uid';
import { NumberField } from './NumberField';

interface Props {
  variations: VariationConfig[];
  eventKeys: string[];
  onChange: (variations: VariationConfig[]) => void;
}

/** One flag's variations and per-event conversion rates. */
export function VariationRatesTable({ variations, eventKeys, onChange }: Props) {
  const update = (id: string, patch: Partial<VariationConfig>) =>
    onChange(variations.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const setRate = (v: VariationConfig, key: string, rate: number | null) =>
    update(v.id, { rates: { ...v.rates, [key]: rate ?? 0 } });

  return (
    <>
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
    </>
  );
}
