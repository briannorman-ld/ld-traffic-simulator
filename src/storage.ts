import type {
  ApiSettings,
  AttrType,
  EncryptedSecret,
  ContextKindConfig,
  FlagConfig,
  SavedConfig,
  SimConfig,
  StaticAttribute,
  VariationConfig,
} from './types';
import { uid } from './uid';

export const STORAGE_KEYS = {
  draft: 'lts:draft',
  saved: 'lts:saved',
  activeSavedId: 'lts:activeSavedId',
} as const;

export function defaultFlag(): FlagConfig {
  return {
    id: uid(),
    key: '',
    eventKeys: [],
    variations: [
      { id: uid(), index: 0, label: 'Control', rates: {} },
      { id: uid(), index: 1, label: 'Treatment', rates: {} },
    ],
  };
}

export function defaultConfig(): SimConfig {
  return {
    api: { token: null, projectKey: '', environmentKey: '' },
    clientSideId: '',
    flags: [defaultFlag()],
    contextKinds: [
      { id: uid(), kind: 'user', keyPrefix: 'sim-user-', anonymous: false, attributes: [] },
    ],
    intervalMs: 500,
    maxContexts: null,
  };
}

export function loadJSON<T>(key: string, normalize: (raw: unknown) => T): T {
  let raw: unknown = undefined;
  try {
    const text = localStorage.getItem(key);
    if (text !== null) raw = JSON.parse(text);
  } catch {
    // Storage blocked or corrupt JSON: fall through to defaults.
  }
  return normalize(raw);
}

export function saveJSON(key: string, value: unknown): void {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage blocked; nothing useful to do.
  }
}

// --- Normalizers: tolerate missing or malformed fields from older/corrupt storage. ---

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function normalizeAttribute(raw: unknown): StaticAttribute | null {
  if (!isObj(raw)) return null;
  const type: AttrType =
    raw.type === 'number' || raw.type === 'boolean' ? raw.type : 'string';
  return { id: str(raw.id) || uid(), name: str(raw.name), value: str(raw.value), type };
}

function normalizeKind(raw: unknown): ContextKindConfig | null {
  if (!isObj(raw)) return null;
  return {
    id: str(raw.id) || uid(),
    kind: str(raw.kind),
    keyPrefix: str(raw.keyPrefix),
    anonymous: raw.anonymous === true,
    attributes: arr(raw.attributes)
      .map(normalizeAttribute)
      .filter((a): a is StaticAttribute => a !== null),
  };
}

function normalizeVariation(raw: unknown): VariationConfig | null {
  if (!isObj(raw)) return null;
  const rates: Record<string, number> = {};
  if (isObj(raw.rates)) {
    for (const [k, v] of Object.entries(raw.rates)) {
      if (typeof v === 'number' && Number.isFinite(v)) rates[k] = v;
    }
  }
  return {
    id: str(raw.id) || uid(),
    index: num(raw.index, 0),
    label: str(raw.label),
    rates,
  };
}

function normalizeVariations(raw: unknown, fallback: VariationConfig[]): VariationConfig[] {
  return Array.isArray(raw)
    ? raw.map(normalizeVariation).filter((v): v is VariationConfig => v !== null)
    : fallback;
}

const strings = (v: unknown): string[] => arr(v).filter((k): k is string => typeof k === 'string');

function normalizeFlag(raw: unknown): FlagConfig | null {
  if (!isObj(raw)) return null;
  return {
    id: str(raw.id) || uid(),
    key: str(raw.key),
    eventKeys: strings(raw.eventKeys),
    variations: normalizeVariations(raw.variations, []),
  };
}

/**
 * Older configs kept one `flagKey` + `variations` at the top level, and later ones one shared
 * `eventKeys` list for every flag. Each shared event moves to the first flag with a non-zero
 * rate for it (or the first flag), since an event now belongs to one flag.
 */
function normalizeFlags(raw: Record<string, unknown>): FlagConfig[] {
  const d = defaultFlag();
  const flags = Array.isArray(raw.flags)
    ? raw.flags.map(normalizeFlag).filter((f): f is FlagConfig => f !== null)
    : [{ ...d, key: str(raw.flagKey), variations: normalizeVariations(raw.variations, d.variations) }];
  for (const key of strings(raw.eventKeys)) {
    if (flags.length === 0 || flags.some((f) => f.eventKeys.includes(key))) continue;
    const owner = flags.find((f) => f.variations.some((v) => (v.rates[key] ?? 0) > 0)) ?? flags[0];
    owner.eventKeys.push(key);
  }
  return flags;
}

function normalizeApi(raw: unknown): ApiSettings {
  if (!isObj(raw)) return { token: null, projectKey: '', environmentKey: '' };
  const t = raw.token;
  const token: EncryptedSecret | null =
    isObj(t) && typeof t.iv === 'string' && typeof t.data === 'string' ? { iv: t.iv, data: t.data } : null;
  return { token, projectKey: str(raw.projectKey), environmentKey: str(raw.environmentKey) };
}

export function normalizeConfig(raw: unknown): SimConfig {
  const d = defaultConfig();
  if (!isObj(raw)) return d;
  return {
    api: normalizeApi(raw.api),
    clientSideId: str(raw.clientSideId),
    flags: normalizeFlags(raw),
    contextKinds: Array.isArray(raw.contextKinds)
      ? raw.contextKinds.map(normalizeKind).filter((k): k is ContextKindConfig => k !== null)
      : d.contextKinds,
    intervalMs: Math.max(0, num(raw.intervalMs, d.intervalMs)),
    maxContexts:
      typeof raw.maxContexts === 'number' && raw.maxContexts > 0 ? raw.maxContexts : null,
  };
}

export function normalizeSaved(raw: unknown): SavedConfig[] {
  return arr(raw)
    .filter(isObj)
    .map((s) => ({
      id: str(s.id) || uid(),
      name: str(s.name, 'Untitled'),
      updatedAt: num(s.updatedAt, Date.now()),
      config: normalizeConfig(s.config),
    }));
}

export function normalizeActiveId(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}
