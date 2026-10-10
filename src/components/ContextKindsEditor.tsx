import { buildContext } from '../sim/contextBuilder';
import type { AttrType, ContextKindConfig, StaticAttribute } from '../types';
import { uid } from '../uid';

interface Props {
  kinds: ContextKindConfig[];
  onChange: (kinds: ContextKindConfig[]) => void;
}

export function ContextKindsEditor({ kinds, onChange }: Props) {
  const update = (id: string, patch: Partial<ContextKindConfig>) =>
    onChange(kinds.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  const updateAttr = (kind: ContextKindConfig, attrId: string, patch: Partial<StaticAttribute>) =>
    update(kind.id, { attributes: kind.attributes.map((a) => (a.id === attrId ? { ...a, ...patch } : a)) });

  let preview = '';
  try {
    if (kinds.length) preview = JSON.stringify(buildContext(kinds, () => '<random-uuid>'), null, 2);
  } catch {
    preview = '';
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Context kinds</h2>
        <span className="muted">
          {kinds.length > 1 ? 'combined into one multi-context per visitor' : 'one context per visitor'}
        </span>
      </div>
      <p className="hint">
        The experiment's randomization unit must be one of these kinds, or LaunchDarkly won't count the traffic.
      </p>

      {kinds.map((kind) => (
        <div key={kind.id} className="subcard">
          <div className="row">
            <label>
              Kind
              <input
                spellCheck={false}
                value={kind.kind}
                placeholder="user"
                onChange={(e) => update(kind.id, { kind: e.target.value.trim() })}
              />
            </label>
            <label className="grow">
              Key prefix
              <input
                spellCheck={false}
                value={kind.keyPrefix}
                placeholder="optional, e.g. sim-user-"
                onChange={(e) => update(kind.id, { keyPrefix: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={kind.anonymous}
                onChange={(e) => update(kind.id, { anonymous: e.target.checked })}
              />
              Anonymous
            </label>
            <button
              type="button"
              className="icon danger"
              aria-label={`Remove ${kind.kind || 'kind'}`}
              title="Remove kind"
              onClick={() => onChange(kinds.filter((k) => k.id !== kind.id))}
            >
              ×
            </button>
          </div>

          {kind.anonymous && kind.attributes.some((a) => a.name.trim()) && (
            <p className="warn-text">
              LaunchDarkly SDKs strip an anonymous context's attributes from exposure (feature) events. They're
              still sent on identify and custom events, but may not be available to slice experiment results.
              Leave this kind non-anonymous if you need them there.
            </p>
          )}
          {kind.attributes.length > 0 && (
            <table className="attrs">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {kind.attributes.map((attr) => (
                  <tr key={attr.id}>
                    <td>
                      <input
                        spellCheck={false}
                        value={attr.name}
                        placeholder="name"
                        onChange={(e) => updateAttr(kind, attr.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={attr.type}
                        onChange={(e) => updateAttr(kind, attr.id, { type: e.target.value as AttrType })}
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                      </select>
                    </td>
                    <td>
                      {attr.type === 'boolean' ? (
                        <select
                          value={attr.value === 'true' ? 'true' : 'false'}
                          onChange={(e) => updateAttr(kind, attr.id, { value: e.target.value })}
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          spellCheck={false}
                          inputMode={attr.type === 'number' ? 'decimal' : undefined}
                          value={attr.value}
                          placeholder="value"
                          onChange={(e) => updateAttr(kind, attr.id, { value: e.target.value })}
                        />
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon"
                        aria-label="Remove attribute"
                        onClick={() =>
                          update(kind.id, { attributes: kind.attributes.filter((a) => a.id !== attr.id) })
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            type="button"
            className="link"
            onClick={() =>
              update(kind.id, {
                attributes: [...kind.attributes, { id: uid(), name: '', value: '', type: 'string' }],
              })
            }
          >
            + Add attribute
          </button>
        </div>
      ))}

      <div className="row">
        <button
          type="button"
          onClick={() =>
            onChange([...kinds, { id: uid(), kind: '', keyPrefix: '', anonymous: false, attributes: [] }])
          }
        >
          + Add context kind
        </button>
      </div>

      {preview && (
        <details>
          <summary>Preview context</summary>
          <pre className="json">{preview}</pre>
        </details>
      )}
    </section>
  );
}
