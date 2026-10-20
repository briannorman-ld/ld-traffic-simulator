import type { LdFlag } from '../api/ldApi';
import { randomizeRates } from '../sim/randomRates';
import { defaultFlag } from '../storage';
import type { FlagConfig } from '../types';
import { SearchSelect } from './SearchSelect';
import { VariationRatesTable } from './VariationRatesTable';

interface Props {
  flags: FlagConfig[];
  /** Flags loaded from the API, or null without a token and project. */
  catalogFlags: LdFlag[] | null;
  eventKeys: string[];
  onChange: (flags: FlagConfig[]) => void;
  /** Called when a flag's typed or picked key matches a flag loaded from the API. */
  onFlagPicked: (id: string, flag: LdFlag) => void;
}

export function FlagsSection({ flags, catalogFlags, eventKeys, onChange, onFlagPicked }: Props) {
  const update = (id: string, patch: Partial<FlagConfig>) =>
    onChange(flags.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <section className="card">
      <div className="card-head">
        <h2>Flags</h2>
        <span className="muted">
          {flags.length > 1 ? 'every visitor is evaluated on each flag' : 'evaluated once per visitor'}
        </span>
      </div>
      <p className="hint">
        Rates are the % of visitors served each variation who fire each event. Index is the variation's position in
        the flag (0 = first).
        {catalogFlags?.length ? ' Picking a flag fills these in; rates you already entered are kept by index.' : ''}
      </p>
      {flags.length > 1 && (
        <p className="hint">
          Each flag rolls separately and an event fires once if any roll hits. If flags share an event, each
          one's actual rate for it lands above its target.
        </p>
      )}
      {eventKeys.length === 0 && <p className="hint">Add an event key to set conversion rates.</p>}

      {flags.map((flag, i) => {
        const known = catalogFlags?.find((f) => f.key === flag.key);
        // Keys used by the other cards; a flag can only be added once.
        const taken = new Set(flags.filter((f) => f.id !== flag.id).map((f) => f.key.trim()).filter(Boolean));
        // Only the later copy gets the message, so the first stays the one to keep.
        const duplicate = !!flag.key.trim() && flags.slice(0, i).some((f) => f.key.trim() === flag.key.trim());
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
                        taken.has(f.key)
                          ? { value: f.key, label: f.key, detail: 'already added', disabled: true }
                          : { value: f.key, label: f.key, detail: f.name },
                      ),
                      // Custom keys in other cards too, so they aren't offered as "Use …".
                      ...[...taken]
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
            <div className="row">
              {known && (
                <span className="hint">
                  {known.name} · {known.variations.length} variations
                </span>
              )}
              <button
                type="button"
                className="link push-right"
                disabled={eventKeys.length === 0 || flag.variations.length === 0}
                title="Random rates from 5–40% per event, with variations within 10% (relative) of each other"
                onClick={() => update(flag.id, { variations: randomizeRates(flag.variations, eventKeys) })}
              >
                Randomize rates
              </button>
            </div>
            <VariationRatesTable
              variations={flag.variations}
              eventKeys={eventKeys}
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
