import { useEffect, useState } from 'react';
import { loadJSON, saveJSON } from '../storage';

/** useState that is read from localStorage on mount and written back on every change. */
export function usePersistentState<T>(key: string, normalize: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => loadJSON(key, normalize));
  useEffect(() => {
    saveJSON(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
