import { useCallback, useEffect, useState } from 'react';

interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  key: string;
  nonce: number;
  data: T | null;
  error: string | null;
}

/**
 * Runs `load` whenever `key` changes (skipped while key is null). Results are tagged with the
 * key they were loaded for, so fast switching between projects can't show the wrong data.
 */
export function useAsyncResource<T>(key: string | null, load: () => Promise<T>): Resource<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load().then(
      (data) => !cancelled && setSettled({ key, nonce, data, error: null }),
      (err) =>
        !cancelled &&
        setSettled({ key, nonce, data: null, error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
    // `load` is recreated every render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = key !== null && settled?.key === key ? settled : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: key !== null && (current === null || current.nonce !== nonce),
    reload,
  };
}
