const BASE = 'https://app.launchdarkly.com';
const API_VERSION = '20240415';
const MAX_PAGES = 50;

export interface LdEnvironment {
  key: string;
  name: string;
  clientSideId: string;
}
export interface LdProject {
  key: string;
  name: string;
}
export interface LdVariation {
  value: unknown;
  name?: string;
}
export interface LdFlag {
  key: string;
  name: string;
  variations: LdVariation[];
}
export interface LdMetric {
  key: string;
  name: string;
  kind: string;
  eventKey: string;
}

interface Page<T> {
  items?: T[];
  _links?: { next?: { href?: string } };
}

async function request<T>(token: string, path: string): Promise<T> {
  const res = await fetch(path.startsWith('http') ? path : BASE + path, {
    headers: { Authorization: token, 'LD-API-Version': API_VERSION },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // keep statusText
    }
    throw new Error(`LaunchDarkly API ${res.status}: ${message}`);
  }
  return (await res.json()) as T;
}

/** Follows `_links.next` until the collection is exhausted (capped at MAX_PAGES). */
async function paginate<T>(token: string, firstPath: string): Promise<T[]> {
  const out: T[] = [];
  let path: string | undefined = firstPath;
  for (let i = 0; path && i < MAX_PAGES; i++) {
    const page: Page<T> = await request<Page<T>>(token, path);
    out.push(...(page.items ?? []));
    const next = page._links?.next?.href;
    path = next && next !== path ? next : undefined;
  }
  return out;
}

const enc = encodeURIComponent;

export async function listProjects(token: string): Promise<LdProject[]> {
  const items = await paginate<{ key: string; name: string }>(token, '/api/v2/projects?limit=100');
  return items.map((p) => ({ key: p.key, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listEnvironments(token: string, projectKey: string): Promise<LdEnvironment[]> {
  const items = await paginate<{ key: string; name: string; _id: string }>(
    token,
    `/api/v2/projects/${enc(projectKey)}/environments?limit=100`,
  );
  return items.map((e) => ({ key: e.key, name: e.name, clientSideId: e._id }));
}

export async function listFlags(token: string, projectKey: string): Promise<LdFlag[]> {
  const items = await paginate<LdFlag>(token, `/api/v2/flags/${enc(projectKey)}?summary=true&limit=100`);
  return items
    .map((f) => ({ key: f.key, name: f.name, variations: f.variations ?? [] }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function getFlag(token: string, projectKey: string, flagKey: string): Promise<LdFlag> {
  const f = await request<LdFlag>(token, `/api/v2/flags/${enc(projectKey)}/${enc(flagKey)}?summary=true`);
  return { key: f.key, name: f.name, variations: f.variations ?? [] };
}

/** Custom metrics only: those are the ones backed by track() event keys. */
export async function listMetrics(token: string, projectKey: string): Promise<LdMetric[]> {
  const items = await paginate<Partial<LdMetric>>(token, `/api/v2/metrics/${enc(projectKey)}?limit=100`);
  return items
    .filter((m): m is LdMetric => m.kind === 'custom' && typeof m.eventKey === 'string' && m.eventKey !== '')
    .map((m) => ({ key: m.key, name: m.name ?? m.key, kind: m.kind, eventKey: m.eventKey }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Display label for a variation: its name, or its JSON value. */
export function variationLabel(v: LdVariation): string {
  return v.name?.trim() || JSON.stringify(v.value);
}
