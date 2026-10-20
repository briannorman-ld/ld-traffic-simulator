import { useEffect, useMemo, useRef, useState } from 'react';
import { getFlag, variationLabel, type LdFlag } from './api/ldApi';
import { ApiSection } from './components/ApiSection';
import { ContextKindsEditor } from './components/ContextKindsEditor';
import { EventLog } from './components/EventLog';
import { FlagsSection } from './components/FlagsSection';
import { RunControls } from './components/RunControls';
import { SavedConfigsBar } from './components/SavedConfigsBar';
import { StatsPanel } from './components/StatsPanel';
import { useLdCatalog } from './hooks/useLdCatalog';
import { usePersistentState } from './hooks/usePersistentState';
import { useTheme } from './hooks/useTheme';
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
  const { theme, toggle: toggleTheme } = useTheme();

  // Stop the run when the page goes away (refresh, close, navigating off) or App unmounts. The
  // browser kills timers on unload anyway, but a page restored from the back/forward cache would
  // otherwise pick the run back up.
  useEffect(() => {
    const stopRun = () => runnerRef.current?.stop();
    window.addEventListener('pagehide', stopRun);
    return () => {
      window.removeEventListener('pagehide', stopRun);
      stopRun();
    };
  }, []);

  const running = status !== 'idle';
  const active = saved.find((s) => s.id === activeId) ?? null;
  const modified = active
    ? JSON.stringify(active.config) !== JSON.stringify(draft)
    : Boolean(draft.clientSideId || draft.flags.some((f) => f.key || f.eventKeys.length));
  const errors = useMemo(() => validateConfig(draft), [draft]);

  const patch = (p: Partial<SimConfig>) => setDraft((d) => ({ ...d, ...p }));
  const confirmDiscard = () => !modified || window.confirm('Discard unsaved changes to the current configuration?');

  /** Fills a flag's variations from the API, keeping rates and averages already entered for each index. */
  async function applyFlag(id: string, flag: LdFlag) {
    let variations = flag.variations;
    if (variations.length === 0 && catalog.token && draft.api.projectKey) {
      try {
        variations = (await getFlag(catalog.token, draft.api.projectKey, flag.key)).variations;
      } catch {
        return; // keep manual variations; the error shows up in the event log
      }
    }
    if (variations.length === 0) return;
    setDraft((d) => ({
      ...d,
      flags: d.flags.map((f) => {
        if (f.id !== id || f.key.trim() !== flag.key) return f; // removed, or the user kept typing
        return {
          ...f,
          variations: variations.map((v, index) => {
            const existing = f.variations.find((x) => x.index === index);
            return {
              id: existing?.id ?? uid(),
              index,
              label: variationLabel(v),
              rates: existing?.rates ?? {},
              ...(existing?.occurrences && { occurrences: existing.occurrences }),
            };
          }),
        };
      }),
    }));
  }

  function start() {
    if (errors.length || runnerRef.current) return; // never two clients at once
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
        <button
          type="button"
          className="icon theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
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
        <div className="layout-top">
          <fieldset className="config" disabled={running}>
            <ApiSection
              api={draft.api}
              catalog={catalog}
              clientSideId={draft.clientSideId}
              onChange={(api) => patch({ api })}
              onClientSideId={(clientSideId) => patch({ clientSideId })}
            />
            <ContextKindsEditor kinds={draft.contextKinds} onChange={(contextKinds) => patch({ contextKinds })} />
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
            <StatsPanel stats={stats} flags={draft.flags} running={running} />
            <EventLog />
          </div>
        </div>

        {/* Full width below both columns, so wide rates tables have room. */}
        <fieldset className="config flags-row" disabled={running}>
          <FlagsSection
            flags={draft.flags}
            catalogFlags={catalog.flags.data}
            metrics={catalog.metrics.data}
            onChange={(flags) => patch({ flags })}
            onFlagPicked={(id, flag) => void applyFlag(id, flag)}
          />
        </fieldset>
      </main>
    </div>
  );
}
