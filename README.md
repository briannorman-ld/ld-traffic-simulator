# LD Experiment Traffic Simulator

Browser-only tool that simulates visitors hitting one or more LaunchDarkly flags and converting on
metric events at per-variation rates, to generate experiment data. No backend and no database: the form,
saved configurations and log filters live in `localStorage`.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # static files in dist/, host anywhere
```

## How a run works

For each visitor, one at a time, using the official browser SDK (`@launchdarkly/js-client-sdk`):

1. Build a context from the configured kinds. More than one kind becomes a single `kind: "multi"`
   context. Every kind gets a random key (plus optional prefix) and its static attributes.
2. `identify` → `variationDetail(flagKey)` for every configured flag.
3. For each flag, roll each of its own event keys against the variation it served and `track()`
   on a hit. Every event belongs to exactly one flag, so flags never inflate each other's rates.
   With "Configure occurrences", a hit tracks the event N times (N ≥ 1, geometric with the
   configured average, capped at 100) for count metrics; the default average of 1 tracks it once.
4. `flush()`, wait the configured ms, repeat until Stop or "stop after N".

## Things to know

- **Randomization unit**: the experiment's randomization context kind has to be one of the
  configured kinds.
- **Anonymous kinds**: LaunchDarkly SDKs strip an anonymous context's attributes from feature
  (exposure) events. They're still sent on identify and custom events. If you need a kind's
  attributes on exposures (e.g. to slice results), leave that kind non-anonymous.
- **Several flags**: each flag has its own event keys, variations and rates, and an event key can
  only be used by one flag. LaunchDarkly still receives every conversion, so another flag's
  experiment using the same metric would see it, just with no difference between its variations.
- **Variation indexes** are the 0-based positions of the flag's variations. Served variations
  with no configured row show up highlighted in Live stats and never convert.
- **API token (optional)**: lets you pick project, environment, flag (auto-fills variations) and
  custom-metric event keys. It's encrypted with AES-GCM using a non-extractable key in this
  browser's IndexedDB, and only the ciphertext is stored with each configuration. That protects
  against someone copying localStorage, not against a malicious script running on the page.
  Clearing site data deletes the key, so you'd re-enter the token. The `Authorization` header is
  redacted in the event log. A read-only token is enough.
- **Event log**: every request the SDK makes (evaluations with the decoded context, event
  batches, diagnostics) and every REST API call, plus one summary row per visitor. Kept in memory
  only, last 1,000 entries.
