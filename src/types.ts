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
  /** eventKey -> average times a visitor who fires the event fires it (at least 1). Missing means 1. */
  occurrences?: Record<string, number>;
}

export interface FlagConfig {
  id: string;
  key: string;
  /** Events this flag drives. Each event key belongs to one flag only. */
  eventKeys: string[];
  variations: VariationConfig[];
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
  /** Every visitor is evaluated on each of these. */
  flags: FlagConfig[];
  contextKinds: ContextKindConfig[];
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
  /** Structured data for visitor rows, so the log can render them as chips. */
  visit?: VisitSummary;
}

export interface VisitFlag {
  flagKey: string;
  variationIndex: number | null;
  /** Configured label, or the served value when no label is set. */
  label: string;
  /** False when the served variation isn't in the flag's rates table. */
  configured: boolean;
}

export interface VisitSummary {
  number: number;
  flags: VisitFlag[];
  /** `count` is how many times the event was tracked (0 when it didn't fire). */
  events: { key: string; converted: boolean; count: number }[];
}

export interface VariationStats {
  index: number | null;
  value: unknown;
  exposures: number;
  /** eventKey -> visitors who fired the event at least once. */
  conversions: Record<string, number>;
  /** eventKey -> track calls sent, counting every occurrence. */
  occurrences: Record<string, number>;
}

export interface RunStats {
  startedAt: number;
  endedAt: number | null;
  contexts: number;
  errors: number;
  /** Flag key -> served variation index (or "fallback" when no index was returned) -> stats. */
  byFlag: Record<string, Record<string, VariationStats>>;
}

export type RunStatus = 'idle' | 'starting' | 'running' | 'stopping';
