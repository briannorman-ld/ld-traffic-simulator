import { avgOccurrences } from '../sim/conversions';
import type { VariationConfig } from '../types';
import { uid } from '../uid';
import { isValidAvgOccurrences } from '../validation';
import { NumberField } from './NumberField';

interface Props {
  variations: VariationConfig[];
  eventKeys: string[];
  /** Shows the average-occurrences input under each rate; hidden values still apply. */
  showOccurrences: boolean;
  onChange: (variations: VariationConfig[]) => void;
}

/** "3.4" for 3.43, "0.05" for 0.05: enough digits to sanity-check small rates. */
const perVisitor = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 2 : 1 });

/** One flag's variations and per-event conversion rates and average occurrences. */
export function VariationRatesTable({ variations, eventKeys, showOccurrences, onChange }: Props) {
  const update = (id: string, patch: Partial<VariationConfig>) =>
    onChange(variations.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const setRate = (v: VariationConfig, key: string, rate: number | null) =>
    update(v.id, { rates: { ...v.rates, [key]: rate ?? 0 } });
  const setAvg = (v: VariationConfig, key: string, avg: number | null) =>
    update(v.id, { occurrences: { ...v.occurrences, [key]: avg ?? 1 } });

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
                {eventKeys.map((k) => {
                  const rate = v.rates[k] ?? 0;
                  const avg = avgOccurrences(v, k);
                  const invalid = rate > 0 && !isValidAvgOccurrences(avg);
                  return (
                    <td key={k}>
                      <span className="pct">
                        <NumberField
                          className="narrow"
                          aria-label={`${k} rate for ${v.label || `index ${v.index}`}`}
                          title="% of visitors served this variation who fire the event at least once"
                          min={0}
                          max={100}
                          step={0.1}
                          value={rate}
                          onChange={(n) => setRate(v, k, n)}
                        />
                        %
                      </span>
                      {showOccurrences && (
                        <>
                          <span className={`pct avg ${rate > 0 ? '' : 'muted'}`}>
                            <NumberField
                              className={`narrow ${invalid ? 'invalid' : ''}`}
                              aria-label={`${k} average per visitor for ${v.label || `index ${v.index}`}`}
                              aria-invalid={invalid}
                              title={
                                invalid
                                  ? 'Must be 1 or more'
                                  : 'Average times a visitor who fires the event fires it (1 = once)'
                              }
                              disabled={rate === 0}
                              min={1}
                              step={0.1}
                              value={avg}
                              onChange={(n) => setAvg(v, k, n)}
                            />
                            avg
                          </span>
                          <div className="muted small" title="rate × average">
                            ≈ {perVisitor((rate / 100) * avg)} / visitor
                          </div>
                        </>
                      )}
                    </td>
                  );
                })}
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
