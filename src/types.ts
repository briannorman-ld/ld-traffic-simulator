export type AttrType = 'string' | 'number' | 'boolean';

export interface StaticAttribute {
  id: string;
  name: string;
  value: string;
  type: AttrType;
}

export interface ContextKindConfig {
  id: string;
  kind: string;
  keyPrefix: string;
  anonymous: boolean;
  attributes: StaticAttribute[];
}

export interface VariationConfig {
  id: string;
  /** Matched against variationDetail().variationIndex. */
  index: number;
  label: string;
  /** eventKey -> conversion rate in percent (0-100). Missing means 0. */
  rates: Record<string, number>;
}

/** AES-GCM ciphertext; the key lives non-extractable in IndexedDB (see secureStore.ts). */
export interface EncryptedSecret {
  iv: string;
  data: string;
}

export interface ApiSettings {
  token: EncryptedSecret | null;
  projectKey: string;
  environmentKey: string;
}

export interface SimConfig {
  api: ApiSettings;
  clientSideId: string;
  flagKey: string;
  eventKeys: string[];
  contextKinds: ContextKindConfig[];
  variations: VariationConfig[];
  intervalMs: number;
  maxContexts: number | null;
}

export interface SavedConfig {
  id: string;
  name: string;
  updatedAt: number;
  config: SimConfig;
}

export type LogCategory =
  | 'run'
  | 'visitor'
  | 'evaluation'
  | 'events'
  | 'diagnostic'
  | 'goals'
  | 'api'
  | 'network'
  | 'sdk';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  time: number;
  category: LogCategory;
  level: LogLevel;
  title: string;
  summary?: string;
  details?: unknown;
}

export interface VariationStats {
  index: number | null;
  value: unknown;
  exposures: number;
  conversions: Record<string, number>;
}

export interface RunStats {
  startedAt: number;
  endedAt: number | null;
  contexts: number;
  errors: number;
  /** Keyed by served variation index, or "fallback" when no index was returned. */
  byVariation: Record<string, VariationStats>;
}

export type RunStatus = 'idle' | 'starting' | 'running' | 'stopping';
