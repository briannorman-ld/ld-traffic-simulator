import { useMemo, useRef, useState } from 'react';
import { getFlag, variationLabel, type LdFlag } from './api/ldApi';
import { ApiSection } from './components/ApiSection';
import { ConnectionSection } from './components/ConnectionSection';
import { ContextKindsEditor } from './components/ContextKindsEditor';
import { EventKeysEditor } from './components/EventKeysEditor';
import { EventLog } from './components/EventLog';
import { RunControls } from './components/RunControls';
import { SavedConfigsBar } from './components/SavedConfigsBar';
import { StatsPanel } from './components/StatsPanel';
import { VariationRatesTable } from './components/VariationRatesTable';
import { useLdCatalog } from './hooks/useLdCatalog';
import { usePersistentState } from './hooks/usePersistentState';
import { SimulationRunner } from './sim/engine';
import {
  defaultConfig,
  normalizeActiveId,
  normalizeConfig,
  normalizeSaved,
  STORAGE_KEYS,
} from './storage';
import type { RunStats, RunStatus, SimConfig } from './types';
import { uid } from './uid';
import { validateConfig } from './validation';

export default function App() {
  const [draft, setDraft] = usePersistentState(STORAGE_KEYS.draft, normalizeConfig);
  const [saved, setSaved] = usePersistentState(STORAGE_KEYS.saved, normalizeSaved);
  const [activeId, setActiveId] = usePersistentState(STORAGE_KEYS.activeSavedId, normalizeActiveId);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const runnerRef = useRef<SimulationRunner | null>(null);
  const catalog = useLdCatalog(draft.api);

  const running = status !== 'idle';
  const active = saved.find((s) => s.id === activeId) ?? null;
  const modified = active
    ? JSON.stringify(active.config) !== JSON.stringify(draft)
    : Boolean(draft.clientSideId || draft.flagKey || draft.eventKeys.length);
  const errors = useMemo(() => validateConfig(draft), [draft]);

  const patch = (p: Partial<SimConfig>) => setDraft((d) => ({ ...d, ...p }));
  const confirmDiscard = () => !modified || window.confirm('Discard unsaved changes to the current configuration?');

  async function applyFlag(flag: LdFlag) {
    let variations = flag.variations;
    if (variations.length === 0 && catalog.token && draft.api.projectKey) {
      try {
        variations = (await getFlag(catalog.token, draft.api.projectKey, flag.key)).variations;
      } catch {
        return; // keep manual variations; the error shows up in the event log
      }
    }
    if (variations.length === 0) return;
    setDraft((d) => {
      if (d.flagKey.trim() !== flag.key) return d; // user kept typing
      return {
        ...d,
        variations: variations.map((v, index) => {
          const existing = d.variations.find((x) => x.index === index);
          return { id: existing?.id ?? uid(), index, label: variationLabel(v), rates: existing?.rates ?? {} };
        }),
      };
    });
  }

  function start() {
    if (errors.length) return;
    setStatusMessage(null);
    const runner = new SimulationRunner(structuredClone(draft), {
      onStatus: (s, message) => {
        setStatus(s);
        if (message !== undefined) setStatusMessage(message);
      },
      onStats: setStats,
    });
    runnerRef.current = runner;
    void runner.run().finally(() => {
      if (runnerRef.current === runner) runnerRef.current = null;
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Experiment Traffic Simulator</h1>
          <span className="muted">LaunchDarkly · runs entirely in your browser</span>
        </div>
        <SavedConfigsBar
          saved={saved}
          activeId={activeId}
          modified={modified}
          disabled={running}
          onLoad={(id) => {
            const s = saved.find((x) => x.id === id);
            if (!s || !confirmDiscard()) return;
            setDraft(structuredClone(s.config));
            setActiveId(id);
          }}
          onNew={() => {
            if (!confirmDiscard()) return;
            // Keep the API connection so a new config doesn't need the token re-entered.
            setDraft({ ...defaultConfig(), api: draft.api });
            setActiveId(null);
          }}
          onSave={() =>
            setSaved((list) =>
              list.map((s) =>
                s.id === activeId ? { ...s, config: structuredClone(draft), updatedAt: Date.now() } : s,
              ),
            )
          }
          onSaveAs={(name) => {
            const id = uid();
            setSaved((list) => [...list, { id, name, updatedAt: Date.now(), config: structuredClone(draft) }]);
            setActiveId(id);
          }}
          onRename={(name) => setSaved((list) => list.map((s) => (s.id === activeId ? { ...s, name } : s)))}
          onDelete={() => {
            if (!active || !window.confirm(`Delete saved configuration “${active.name}”?`)) return;
            setSaved((list) => list.filter((s) => s.id !== activeId));
            setActiveId(null);
          }}
        />
      </header>

      <main className="layout">
        <fieldset className="config" disabled={running}>
          <ApiSection
            api={draft.api}
            catalog={catalog}
            onChange={(api) => patch({ api })}
            onEnvironmentPicked={(clientSideId) => patch({ clientSideId })}
          />
          <ConnectionSection
            clientSideId={draft.clientSideId}
            flagKey={draft.flagKey}
            flags={catalog.flags.data}
            onClientSideId={(clientSideId) => patch({ clientSideId })}
            onFlagKey={(flagKey) => patch({ flagKey })}
            onFlagPicked={(flag) => void applyFlag(flag)}
          />
          <EventKeysEditor
            eventKeys={draft.eventKeys}
            metrics={catalog.metrics.data}
            onAdd={(key) => setDraft((d) => ({ ...d, eventKeys: [...d.eventKeys, key] }))}
            onRemove={(key) =>
              setDraft((d) => ({
                ...d,
                eventKeys: d.eventKeys.filter((k) => k !== key),
                variations: d.variations.map((v) => {
                  const rates = { ...v.rates };
                  delete rates[key];
                  return { ...v, rates };
                }),
              }))
            }
          />
          <ContextKindsEditor kinds={draft.contextKinds} onChange={(contextKinds) => patch({ contextKinds })} />
          <VariationRatesTable
            variations={draft.variations}
            eventKeys={draft.eventKeys}
            apiFlagsAvailable={Boolean(catalog.flags.data?.length)}
            onChange={(variations) => patch({ variations })}
          />
        </fieldset>

        <div className="monitor">
          <RunControls
            intervalMs={draft.intervalMs}
            maxContexts={draft.maxContexts}
            status={status}
            statusMessage={statusMessage}
            errors={errors}
            onIntervalMs={(intervalMs) => patch({ intervalMs })}
            onMaxContexts={(maxContexts) => patch({ maxContexts })}
            onStart={start}
            onStop={() => runnerRef.current?.stop()}
          />
          <StatsPanel stats={stats} variations={draft.variations} eventKeys={draft.eventKeys} running={running} />
          <EventLog />
        </div>
      </main>
    </div>
  );
}
