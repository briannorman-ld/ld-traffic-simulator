import type { LogEntry } from '../types';

const MAX_ENTRIES = 1000;

let entries: LogEntry[] = [];
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

export const logStore = {
  add(entry: Omit<LogEntry, 'id' | 'time'> & { time?: number }) {
    const full: LogEntry = { ...entry, id: nextId++, time: entry.time ?? Date.now() };
    // Network entries are added when their response arrives but stamped with the request time,
    // so keep the list ordered by time rather than by arrival.
    entries = [full, ...entries].sort((a, b) => b.time - a.time || b.id - a.id).slice(0, MAX_ENTRIES);
    scheduleNotify();
  },
  clear() {
    entries = [];
    scheduleNotify();
  },
  getSnapshot: () => entries,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  maxEntries: MAX_ENTRIES,
};
