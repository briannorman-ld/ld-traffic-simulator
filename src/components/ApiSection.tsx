import { useState } from 'react';
import type { LdCatalog } from '../hooks/useLdCatalog';
import { encryptSecret } from '../secureStore';
import type { ApiSettings } from '../types';
import { SearchSelect } from './SearchSelect';

interface Props {
  api: ApiSettings;
  catalog: LdCatalog;
  clientSideId: string;
  onChange: (api: ApiSettings) => void;
  onClientSideId: (clientSideId: string) => void;
}

export function ApiSection({ api, catalog, clientSideId, onChange, onClientSideId }: Props) {
  const [draftToken, setDraftToken] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { token, tokenError, projects, environments, flags, metrics } = catalog;
  const showTokenInput = !api.token || replacing || tokenError !== null;

  async function saveToken() {
    const t = draftToken.trim();
    if (!t) return;
    try {
      const encrypted = await encryptSecret(t);
      onChange({ ...api, token: encrypted });
      setDraftToken('');
      setReplacing(false);
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  const loadError = projects.error ?? environments.error ?? flags.error ?? metrics.error;
  const anyLoading = projects.loading || environments.loading || flags.loading || metrics.loading;

  return (
    <section className="card">
      <div className="card-head">
        <h2>LaunchDarkly</h2>
        <span className="muted">API token optional · fills in projects, flags, variations and metrics</span>
      </div>

      {showTokenInput ? (
        <div className="row">
          <label className="grow">
            API access token (optional)
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="api-…"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveToken()}
            />
          </label>
          <button type="button" className="primary" disabled={!draftToken.trim()} onClick={() => void saveToken()}>
            Save token
          </button>
          {replacing && (
            <button type="button" onClick={() => setReplacing(false)}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="row">
          <span className="pill ok">{token ? `Token saved (encrypted) · …${token.slice(-4)}` : 'Decrypting token…'}</span>
          <button type="button" onClick={() => setReplacing(true)}>
            Replace
          </button>
          <button type="button" onClick={() => onChange({ token: null, projectKey: '', environmentKey: '' })}>
            Remove
          </button>
        </div>
      )}
      {(tokenError || saveError) && <p className="error-text">{tokenError ?? saveError}</p>}
      <p className="hint">
        Encrypted with a key that can't leave this browser and saved with this configuration. A read-only
        token is enough.
      </p>

      {token && (
        <>
          <div className="row">
            <label className="grow">
              Project{projects.data ? ` (${projects.data.length})` : ''}
              <SearchSelect
                options={projects.data?.map((p) => ({ value: p.key, label: p.name, detail: p.key })) ?? []}
                value={api.projectKey}
                placeholder={projects.loading ? 'Loading projects…' : 'Search projects by name or key'}
                emptyText={projects.loading ? 'Loading…' : 'No projects'}
                onChange={(projectKey) =>
                  projectKey !== api.projectKey && onChange({ ...api, projectKey, environmentKey: '' })
                }
              />
            </label>
            <label className="grow">
              Environment
              <select
                value={api.environmentKey}
                disabled={!api.projectKey}
                onChange={(e) => {
                  const env = environments.data?.find((x) => x.key === e.target.value);
                  onChange({ ...api, environmentKey: e.target.value });
                  if (env) onClientSideId(env.clientSideId);
                }}
              >
                <option value="">{environments.loading ? 'Loading…' : 'Select an environment'}</option>
                {environments.data?.map((env) => (
                  <option key={env.key} value={env.key}>
                    {env.name} ({env.key})
                  </option>
                ))}
                {api.environmentKey && !environments.data?.some((x) => x.key === api.environmentKey) && (
                  <option value={api.environmentKey}>{api.environmentKey}</option>
                )}
              </select>
            </label>
          </div>
          {api.projectKey && (
            <div className="row">
              <span className="muted">
                {anyLoading
                  ? 'Loading…'
                  : `${flags.data?.length ?? 0} flags · ${metrics.data?.length ?? 0} custom metrics`}
              </span>
              <button
                type="button"
                className="link"
                onClick={() => {
                  environments.reload();
                  flags.reload();
                  metrics.reload();
                }}
              >
                Refresh
              </button>
            </div>
          )}
          {loadError && <p className="error-text">{loadError}</p>}
        </>
      )}

      <label>
        Client-side ID
        <input
          spellCheck={false}
          placeholder={token ? 'Filled in when you pick an environment' : 'e.g. 64f0c1…'}
          value={clientSideId}
          onChange={(e) => onClientSideId(e.target.value.trim())}
        />
      </label>
    </section>
  );
}
