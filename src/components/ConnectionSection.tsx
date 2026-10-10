import type { LdFlag } from '../api/ldApi';
import { SearchSelect } from './SearchSelect';

interface Props {
  clientSideId: string;
  flagKey: string;
  flags: LdFlag[] | null;
  onClientSideId: (v: string) => void;
  onFlagKey: (v: string) => void;
  /** Called when the typed or picked key matches a flag loaded from the API. */
  onFlagPicked: (flag: LdFlag) => void;
}

export function ConnectionSection({ clientSideId, flagKey, flags, onClientSideId, onFlagKey, onFlagPicked }: Props) {
  const known = flags?.find((f) => f.key === flagKey);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Experiment</h2>
      </div>
      <div className="row">
        <label className="grow">
          Client-side ID
          <input
            spellCheck={false}
            placeholder="e.g. 64f0c1…"
            value={clientSideId}
            onChange={(e) => onClientSideId(e.target.value.trim())}
          />
        </label>
        <label className="grow">
          Flag key{flags ? ` (${flags.length})` : ''}
          {flags ? (
            <SearchSelect
              allowCustom
              options={flags.map((f) => ({ value: f.key, label: f.key, detail: f.name }))}
              value={flagKey}
              placeholder="Search flags by key or name"
              emptyText="No flags in this project"
              onChange={(key) => {
                onFlagKey(key);
                const match = flags.find((f) => f.key === key);
                if (match) onFlagPicked(match);
              }}
            />
          ) : (
            <input
              spellCheck={false}
              placeholder="my-experiment-flag"
              value={flagKey}
              onChange={(e) => onFlagKey(e.target.value)}
            />
          )}
        </label>
      </div>
      {known && <p className="hint">{known.name} · {known.variations.length} variations</p>}
    </section>
  );
}
