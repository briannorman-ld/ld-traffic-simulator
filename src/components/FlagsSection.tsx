import { useState } from 'react';
import type { LdFlag, LdMetric } from '../api/ldApi';
import { avgOccurrences } from '../sim/conversions';
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

/** True when any of the flag's events has an average other than the default of 1. */
const hasCustomOccurrences = (f: FlagConfig) =>
  f.variations.some((v) => f.eventKeys.some((k) => avgOccurrences(v, k) !== 1));

export function FlagsSection({ flags, catalogFlags, metrics, onChange, onFlagPicked }: Props) {
  // Flag id -> occurrences shown. Unset means shown only when the flag already has custom averages.
  const [occurrencesShown, setOccurrencesShown] = useState<Record<string, boolean>>({});
  const update = (id: string, patch: Partial<FlagConfig>) =>
    onChange(flags.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeEvent = (flag: FlagConfig, key: string) =>
    update(flag.id, {
      eventKeys: flag.eventKeys.filter((k) => k !== key),
      variations: flag.variations.map((v) => {
        const rates = { ...v.rates };
        delete rates[key];
        if (!v.occurrences) return { ...v, rates };
        const occurrences = { ...v.occurrences };
        delete occurrences[key];
        return { ...v, rates, occurrences };
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
        Each flag drives its own events, and an event belongs to one flag only. For each variation and event, the % is
        the share of visitors served that variation who fire the event at least once. “Configure occurrences” adds an
        “avg” for how many times they fire it on average once they do (1 = once, the default; raise it for count
        metrics). Index is the variation's position in the flag (0 = first).
        {catalogFlags?.length ? ' Picking a flag fills these in; values you already entered are kept by index.' : ''}
      </p>

      {flags.map((flag, i) => {
        const known = catalogFlags?.find((f) => f.key === flag.key);
        const customOccurrences = hasCustomOccurrences(flag);
        const showOccurrences = occurrencesShown[flag.id] ?? customOccurrences;
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
                aria-expanded={showOccurrences}
                disabled={flag.eventKeys.length === 0 || flag.variations.length === 0}
                title="Average times a visitor who fires an event fires it, for count metrics (default 1)"
                onClick={() => setOccurrencesShown({ ...occurrencesShown, [flag.id]: !showOccurrences })}
              >
                {showOccurrences ? 'Hide occurrences' : `Configure occurrences${customOccurrences ? ' (customized)' : ''}`}
              </button>
              <button
                type="button"
                className="link"
                disabled={flag.eventKeys.length === 0 || flag.variations.length === 0}
                title="Random rates from 5–40% per event, with variations within 10% (relative) of each other. Averages are kept."
                onClick={() => update(flag.id, { variations: randomizeRates(flag.variations, flag.eventKeys) })}
              >
                Randomize rates
              </button>
            </div>
            <VariationRatesTable
              variations={flag.variations}
              eventKeys={flag.eventKeys}
              showOccurrences={showOccurrences}
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
