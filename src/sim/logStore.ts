import type { LogCategory, LogEntry } from '../types';

const MAX_ENTRIES = 1000;

export interface LogState {
  /** Newest first, capped at MAX_ENTRIES (run entries are never dropped). */
  entries: LogEntry[];
  /** Running totals per category since the last clear, including entries that were dropped. */
  totals: Partial<Record<LogCategory, number>>;
  totalAdded: number;
}

let state: LogState = { entries: [], totals: {}, totalAdded: 0 };
let nextId = 1;
let frame: number | null = null;
const listeners = new Set<() => void>();

// Notify at most once per animation frame so fast runs don't re-render on every entry.
function scheduleNotify() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    listeners.forEach((l) => l());
  });
}

/** Drops the oldest non-run entries until the list fits. */
function trim(entries: LogEntry[]): LogEntry[] {
  let excess = entries.length - MAX_ENTRIES;
  if (excess <= 0) return entries;
  const out = [...entries];
  for (let i = out.length - 1; i >= 0 && excess > 0; i--) {
    if (out[i].category !== 'run') {
      out.splice(i, 1);
      excess--;
    }
  }
  return out;
}

export const logStore = {
  add(entry: Omit<LogEntry, 'id' | 'time'> & { time?: number }) {
    const full: LogEntry = { ...entry, id: nextId++, time: entry.time ?? Date.now() };
    // Network entries are added when their response arrives but stamped with the request time,
    // so keep the list ordered by time rather than by arrival.
    const entries = [full, ...state.entries].sort((a, b) => b.time - a.time || b.id - a.id);
    state = {
      entries: trim(entries),
      totals: { ...state.totals, [full.category]: (state.totals[full.category] ?? 0) + 1 },
      totalAdded: state.totalAdded + 1,
    };
    scheduleNotify();
  },
  clear() {
    state = { entries: [], totals: {}, totalAdded: 0 };
    scheduleNotify();
  },
  getSnapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  maxEntries: MAX_ENTRIES,
};
