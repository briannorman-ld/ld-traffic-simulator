import type { LogCategory } from '../types';
import { logStore } from './logStore';

function categorize(url: URL): LogCategory {
  const p = url.pathname;
  if (p.startsWith('/api/v2/')) return 'api';
  if (p.includes('/sdk/evalx/') || p.includes('/eval/')) return 'evaluation';
  if (p.includes('/events/bulk/')) return 'events';
  if (p.includes('/events/diagnostic/')) return 'diagnostic';
  if (p.includes('/sdk/goals/')) return 'goals';
  return 'network';
}

function tryParse(text: string | undefined): unknown {
  if (text === undefined || text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function decodeBase64Url(segment: string): unknown {
  try {
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

/** The evalx GET request carries the context base64url-encoded in the path. */
function contextFromUrl(url: URL): unknown {
  const m = url.pathname.match(/\/contexts?\/([^/]+)$/);
  return m ? decodeBase64Url(decodeURIComponent(m[1])) : undefined;
}

function headersToObject(h: HeadersInit | undefined): Record<string, string> | undefined {
  if (!h) return undefined;
  const out = Object.fromEntries(new Headers(h).entries());
  // Never put the REST API access token in the log.
  if (out.authorization) out.authorization = '[redacted]';
  return out;
}

function summarizeEvents(body: unknown): string | undefined {
  if (!Array.isArray(body)) return undefined;
  const counts = new Map<string, number>();
  for (const e of body as { kind?: string; key?: string }[]) {
    const label = e.kind === 'custom' ? `custom:${e.key}` : String(e.kind);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(', ');
}

function summarizeEvaluation(body: unknown, flagKey: string | null): string | undefined {
  if (!flagKey || typeof body !== 'object' || body === null) return undefined;
  const flag = (body as Record<string, { variation?: number; value?: unknown }>)[flagKey];
  if (!flag) return `"${flagKey}" not in response`;
  return `${flagKey} → variation ${flag.variation ?? '—'} (${JSON.stringify(flag.value)})`;
}

let installed = false;
let currentFlagKey: string | null = null;

/** Lets evaluation log rows summarize the flag being simulated. */
export function setLoggedFlagKey(key: string | null) {
  currentFlagKey = key;
}

/** Wraps window.fetch so every request the SDK makes (and its response) lands in the log. */
export function installNetworkLog() {
  if (installed) return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = new URL(href, window.location.href);
    const category = categorize(url);
    const started = Date.now();
    const requestBody =
      typeof init?.body === 'string' ? tryParse(init.body) : init?.body ? '[non-text body]' : undefined;
    const request = {
      method,
      url: url.href,
      headers: headersToObject(init?.headers),
      body: requestBody,
      context: category === 'evaluation' && method === 'GET' ? contextFromUrl(url) : undefined,
    };
    const title = `${method} ${url.pathname}`;

    try {
      const res = await original(input, init);
      const clone = res.clone();
      void clone
        .text()
        .catch(() => undefined)
        .then((text) => {
          const body = tryParse(text);
          logStore.add({
            time: started,
            category,
            level: res.ok || res.status === 304 ? 'info' : 'error',
            title: `${title} → ${res.status}`,
            summary:
              category === 'events'
                ? summarizeEvents(requestBody)
                : category === 'evaluation'
                  ? summarizeEvaluation(body, currentFlagKey)
                  : undefined,
            details: {
              durationMs: Date.now() - started,
              request,
              response: { status: res.status, headers: headersToObject(res.headers), body },
            },
          });
        });
      return res;
    } catch (err) {
      logStore.add({
        time: started,
        category,
        level: 'error',
        title: `${title} → failed`,
        summary: err instanceof Error ? err.message : String(err),
        details: { durationMs: Date.now() - started, request, error: String(err) },
      });
      throw err;
    }
  };
}
