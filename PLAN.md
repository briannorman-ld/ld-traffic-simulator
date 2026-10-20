# LaunchDarkly Experiment Traffic Simulator — Plan

A browser-only utility that simulates visitors hitting a LaunchDarkly flag and converting on
one or more metric events at configurable per-variation rates, to generate experiment data.
No backend, no database. All state lives in `localStorage`.

## Decisions (confirmed)

| Topic | Decision |
|---|---|
| Stack | Vite + React + TypeScript, built to static files |
| Sending traffic | Official LaunchDarkly browser SDK (`identify` → `variationDetail` → `track` → `flush`) |
| Flags (added) | One or more flags, each with its own event keys, variations & rates. Every visitor is evaluated on all of them; an event key belongs to one flag, and only that flag's served variation decides it |
| Variations | Entered manually, or auto-filled from the flag when an API token is set; each has its own rate per event key |
| Multiple event keys | Independent: each event gets its own roll for every context |
| Context kinds | All configured kinds are combined into one multi-context per visitor (a single kind gives a single-kind context) |
| Anonymous | Checkbox per kind; when it's checked, every context of that kind has `anonymous: true` |
| Attributes | Random key (optional prefix per kind) plus static key/value attributes per kind |
| Pacing | "ms between calls" input, plus an optional "stop after N contexts" box (leave it empty to run until stopped) |
| Conversion model | Probabilistic: each context converts with probability *p* |
| Metric type | Conversion only (`track(key)` with no metric value) |
| Extras | Live stats panel |
| REST API (added) | Optional access token. Pick project and environment from dropdowns (fills in the client-side ID); flag picker auto-fills variations; event keys are suggested from the project's custom metrics |
| Token storage | Per saved config, AES-GCM encrypted with a non-extractable device key in IndexedDB (no passphrase) |
| Event log | Kept in memory only (clears on refresh) |

## Data model

```ts
type AttrType = 'string' | 'number' | 'boolean';

interface StaticAttribute { id: string; name: string; value: string; type: AttrType }

interface ContextKindConfig {
  id: string;
  kind: string;            // e.g. "user", "device", "organization"
  keyPrefix: string;       // optional, e.g. "sim-user-"
  anonymous: boolean;
  attributes: StaticAttribute[];
}

interface VariationConfig {
  id: string;
  index: number;           // matched against variationDetail().variationIndex
  label: string;           // display only, e.g. "Control", "Treatment"
  rates: Record<string, number>; // eventKey -> 0..100 (%)
}

interface FlagConfig { id: string; key: string; eventKeys: string[]; variations: VariationConfig[] }

interface SimConfig {
  clientSideId: string;
  flags: FlagConfig[];     // older top-level flagKey/variations/eventKeys are migrated on load
  contextKinds: ContextKindConfig[];
  intervalMs: number;
  maxContexts: number | null;
}

interface SavedConfig { id: string; name: string; updatedAt: number; config: SimConfig }
```

### localStorage keys
- `lts:draft`: the working form (`SimConfig`), saved on every change so it survives refreshes.
- `lts:saved`: `SavedConfig[]`.
- `lts:activeSavedId`: the saved config currently loaded, so the UI can show "modified since save".

Every read and write goes through one `storage.ts` module with try/catch and schema defaults, so a
missing or corrupt value never breaks the app.

## Simulation engine (`src/sim/engine.ts`)

One SDK client per run, started with streaming off and its own event sending.

For each tick:
1. Build a context (`contextBuilder.ts`):
   - one kind → `{ kind, key, anonymous?, ...attrs }`
   - several kinds → `{ kind: 'multi', user: {...}, device: {...} }`
   - key = `keyPrefix + crypto.randomUUID()`. We always set the key ourselves so the SDK never
     reuses a cached anonymous key, and every visitor is unique.
2. `await client.identify(context)`
3. `const detail = client.variationDetail(flagKey, null)`, then record `variationIndex`, `value` and `reason`.
4. Find the matching `VariationConfig` by index. For each event key, roll
   `Math.random() * 100 < rate` → `client.track(eventKey)`.
   - If no configured variation matches (e.g. the flag is off and the fallback was served), count it
     as "unmatched" in stats and send no conversions.
5. `await client.flush()` so each visitor's events go out as their own batch.
6. Wait `intervalMs`, then repeat. Stop on Stop or when `maxContexts` is reached.

SDK settings to note:
- `disableCache: true`, so thousands of identifies don't fill localStorage with the SDK's flag cache.
- Anonymous kinds: the SDK always strips their attributes from feature events (not configurable).
  The UI warns when an anonymous kind has attributes.
- Flag the "randomization unit" gotcha in the UI: the experiment's randomization context kind has to be one
  of the configured kinds, or LD won't count the traffic.

## Event log (`src/sim/fetchInterceptor.ts`)

- Wrap `window.fetch` (and `navigator.sendBeacon`, if the SDK uses it on unload) while a run is active.
- Capture POSTs to the events endpoint (`/events/bulk/{clientSideId}`): timestamp, URL, HTTP status,
  and the parsed JSON body.
- UI: newest first, one row per batch, with a summary (context key, variation, events: `index`,
  `feature`, `custom:<key>` …) that expands to show the pretty-printed payload. Copy-to-clipboard
  button. Capped at 1,000 entries in memory, plus a Clear button.
- Diagnostic posts (`/events/diagnostic/...`) are labeled, and a toggle hides them.

## Live stats panel

Per variation: contexts exposed, then for each event key the conversions, actual rate and target rate.
Also shows total contexts sent, unmatched evaluations, errors, elapsed time and the effective rate
(contexts/sec). Resets when a new run starts.

## UI layout

```
┌ Header: Saved configs [dropdown] [Save] [Save as…] [Rename] [Delete]  • modified ┐
├ Connection: Client-side ID · Flag key                                            │
├ Events: event key chips (add/remove)                                             │
├ Context kinds: repeatable cards → kind, key prefix, ☐ anonymous, attributes table│
├ Variations × events: table of rows = variations (index, label),                  │
│                      columns = event keys, cells = % rate                        │
├ Run: ms between calls · stop after N (optional) · [Start] [Stop]                 │
├ Live stats                                                                       │
└ Event log                                                                        ┘
```

Validation blocks Start when required fields are missing, a rate is outside 0–100, kind names are
duplicated or invalid, or variation indexes are duplicated.

## Project structure

```
src/
  main.tsx, App.tsx
  types.ts
  storage.ts                # localStorage read/write + defaults
  hooks/useDraft.ts         # auto-persisted working config
  hooks/useSavedConfigs.ts
  sim/contextBuilder.ts
  sim/engine.ts             # run loop, emits stats/log updates
  sim/fetchInterceptor.ts
  components/
    SavedConfigsBar.tsx
    ConnectionSection.tsx
    EventKeysEditor.tsx
    ContextKindsEditor.tsx
    VariationRatesTable.tsx
    RunControls.tsx
    StatsPanel.tsx
    EventLog.tsx
```

## Testing

- Vitest unit tests: `contextBuilder` (single kind vs. multi-context, anonymous, attribute typing),
  conversion roller (seeded RNG, rate bounds), and `storage` (defaults, corrupt-data recovery).
- Manual end-to-end test against a real LD project: run a test experiment, check the batches in the
  event log, then check that exposures and conversions show up in LD's experiment results.

## Build phases

1. Scaffold Vite + React + TS, storage layer, config form with auto-persist.
2. Saved configs (save / save as / load / rename / delete).
3. Context builder and simulation engine with the SDK.
4. Fetch interceptor and event log.
5. Live stats panel.
6. Validation, polish, tests.

## Resolved follow-ups

1. **Overlapping calls**: sequential. The next visitor waits until the previous one has flushed,
   so the interval is a minimum gap.
2. **Conversion timing**: `track` fires immediately after the flag evaluation.
3. **Variation matching**: by variation index (0, 1, 2…), with a label for display.
4. **Event log scope**: everything. Evaluation requests and responses, event batches, diagnostics
   and errors are logged, each with a type filter.
