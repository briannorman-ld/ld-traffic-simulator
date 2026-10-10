import { useEffect, useState } from 'react';
import { listEnvironments, listFlags, listMetrics, listProjects } from '../api/ldApi';
import { decryptSecret } from '../secureStore';
import type { ApiSettings } from '../types';
import { useAsyncResource } from './useAsyncResource';

/** Decrypts the config's API token and loads projects, environments, flags and metrics with it. */
export function useLdCatalog(api: ApiSettings) {
  const cipher = api.token ? `${api.token.iv}:${api.token.data}` : null;
  const [decrypted, setDecrypted] = useState<{ cipher: string; token: string | null; error: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!api.token || !cipher) return;
    let cancelled = false;
    decryptSecret(api.token).then(
      (token) => !cancelled && setDecrypted({ cipher, token, error: null }),
      (err) =>
        !cancelled &&
        setDecrypted({
          cipher,
          token: null,
          error: err instanceof Error && err.message ? err.message : 'Could not decrypt the saved token.',
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [api.token, cipher]);

  const current = cipher && decrypted?.cipher === cipher ? decrypted : null;
  const token = current?.token ?? null;
  const tokenError = current?.error ?? null;

  const project = api.projectKey;
  // Keys include the ciphertext so switching tokens refetches.
  const projects = useAsyncResource(token ? cipher : null, () => listProjects(token!));
  const projKey = token && project ? `${cipher}|${project}` : null;
  const environments = useAsyncResource(projKey, () => listEnvironments(token!, project));
  const flags = useAsyncResource(projKey, () => listFlags(token!, project));
  const metrics = useAsyncResource(projKey, () => listMetrics(token!, project));

  return { token, tokenError, projects, environments, flags, metrics };
}

export type LdCatalog = ReturnType<typeof useLdCatalog>;
