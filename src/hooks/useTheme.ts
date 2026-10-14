import { useEffect } from 'react';
import { usePersistentState } from './usePersistentState';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'lts:theme';

function systemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Theme preference persisted to localStorage; defaults to the OS theme on first load. */
export function useTheme() {
  const [theme, setTheme] = usePersistentState<Theme>(STORAGE_KEY, (raw) =>
    raw === 'light' || raw === 'dark' ? raw : systemTheme(),
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return { theme, toggle } as const;
}
