import type { LdFlag } from '../api/ldApi';

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
          Flag key
          <input
            spellCheck={false}
            list="flag-options"
            placeholder={flags ? 'Type or pick a flag' : 'my-experiment-flag'}
            value={flagKey}
            onChange={(e) => {
              const v = e.target.value;
              onFlagKey(v);
              const match = flags?.find((f) => f.key === v.trim());
              if (match) onFlagPicked(match);
            }}
          />
          <datalist id="flag-options">
            {flags?.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </datalist>
        </label>
      </div>
      {known && <p className="hint">{known.name} · {known.variations.length} variations</p>}
    </section>
  );
}
