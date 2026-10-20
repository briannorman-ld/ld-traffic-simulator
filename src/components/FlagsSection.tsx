import type { LdFlag, LdMetric } from '../api/ldApi';
import { randomizeRates } from '../sim/randomRates';
import { defaultFlag } from '../storage';
import type { FlagConfig } from '../types';
import { EventKeysEditor } from './EventKeysEditor';
import { SearchSelect } from './SearchSelect';
import { VariationRatesTable } from './VariationRatesTable';

interface Props {
  flags: FlagConfig[];
  /** Flags loaded from the API, or null without a token and project. */
  catalogFlags: LdFlag[] | null;
  /** Custom metrics loaded from the API, suggested as event keys. */
  metrics: LdMetric[] | null;
  onChange: (flags: FlagConfig[]) => void;
  /** Called when a flag's typed or picked key matches a flag loaded from the API. */
  onFlagPicked: (id: string, flag: LdFlag) => void;
}

const flagLabel = (f: FlagConfig, i: number) => (f.key.trim() ? `"${f.key.trim()}"` : `flag #${i + 1}`);

export function FlagsSection({ flags, catalogFlags, metrics, onChange, onFlagPicked }: Props) {
  const update = (id: string, patch: Partial<FlagConfig>) =>
    onChange(flags.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeEvent = (flag: FlagConfig, key: string) =>
    update(flag.id, {
      eventKeys: flag.eventKeys.filter((k) => k !== key),
      variations: flag.variations.map((v) => {
        const rates = { ...v.rates };
        delete rates[key];
        return { ...v, rates };
      }),
    });

  return (
    <section className="card">
      <div className="card-head">
        <h2>Flags</h2>
        <span className="muted">
          {flags.length > 1 ? 'every visitor is evaluated on each flag' : 'evaluated once per visitor'}
        </span>
      </div>
      <p className="hint">
        Each flag drives its own events: rates are the % of visitors served each variation who fire each event, and an
        event belongs to one flag only. Index is the variation's position in the flag (0 = first).
        {catalogFlags?.length ? ' Picking a flag fills these in; rates you already entered are kept by index.' : ''}
      </p>

      {flags.map((flag, i) => {
        const known = catalogFlags?.find((f) => f.key === flag.key);
        // Keys used by the other cards; a flag can only be added once.
        const takenFlags = new Set(flags.filter((f) => f.id !== flag.id).map((f) => f.key.trim()).filter(Boolean));
        // Only the later copy gets the message, so the first stays the one to keep.
        const duplicate = !!flag.key.trim() && flags.slice(0, i).some((f) => f.key.trim() === flag.key.trim());
        // Events other cards use; an event belongs to one flag.
        const takenEvents = new Map(
          flags.flatMap((f, j) => (f.id === flag.id ? [] : f.eventKeys.map((k) => [k, flagLabel(f, j)] as const))),
        );
        return (
          <div key={flag.id} className="subcard">
            <div className="row">
              <label className="grow">
                Flag key{catalogFlags ? ` (${catalogFlags.length})` : ''}
                {catalogFlags ? (
                  <SearchSelect
                    allowCustom
                    options={[
                      ...catalogFlags.map((f) =>
                        takenFlags.has(f.key)
                          ? { value: f.key, label: f.key, detail: 'already added', disabled: true }
                          : { value: f.key, label: f.key, detail: f.name },
                      ),
                      // Custom keys in other cards too, so they aren't offered as "Use …".
                      ...[...takenFlags]
                        .filter((key) => !catalogFlags.some((f) => f.key === key))
                        .map((key) => ({ value: key, label: key, detail: 'already added', disabled: true })),
                    ]}
                    value={flag.key}
                    placeholder="Search flags by key or name"
                    emptyText="No flags in this project"
                    onChange={(key) => {
                      update(flag.id, { key });
                      const match = catalogFlags.find((f) => f.key === key);
                      if (match) onFlagPicked(flag.id, match);
                    }}
                  />
                ) : (
                  <input
                    spellCheck={false}
                    placeholder="my-flag"
                    value={flag.key}
                    onChange={(e) => update(flag.id, { key: e.target.value })}
                  />
                )}
              </label>
              {flags.length > 1 && (
                <button
                  type="button"
                  className="icon danger"
                  aria-label={`Remove ${flag.key || `flag #${i + 1}`}`}
                  title="Remove flag"
                  onClick={() => onChange(flags.filter((f) => f.id !== flag.id))}
                >
                  ×
                </button>
              )}
            </div>
            {duplicate && <p className="error-text">This flag is already added above.</p>}
            <EventKeysEditor
              eventKeys={flag.eventKeys}
              metrics={metrics}
              taken={takenEvents}
              onAdd={(key) => update(flag.id, { eventKeys: [...flag.eventKeys, key] })}
              onRemove={(key) => removeEvent(flag, key)}
            />
            <div className="row">
              {known && (
                <span className="hint">
                  {known.name} · {known.variations.length} variations
                </span>
              )}
              <button
                type="button"
                className="link push-right"
                disabled={flag.eventKeys.length === 0 || flag.variations.length === 0}
                title="Random rates from 5–40% per event, with variations within 10% (relative) of each other"
                onClick={() => update(flag.id, { variations: randomizeRates(flag.variations, flag.eventKeys) })}
              >
                Randomize rates
              </button>
            </div>
            <VariationRatesTable
              variations={flag.variations}
              eventKeys={flag.eventKeys}
              onChange={(variations) => update(flag.id, { variations })}
            />
          </div>
        );
      })}

      <div className="row">
        <button type="button" onClick={() => onChange([...flags, defaultFlag()])}>
          + Add flag
        </button>
      </div>
    </section>
  );
}
