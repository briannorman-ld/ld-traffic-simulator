import type { LDContext } from '@launchdarkly/js-client-sdk';
import type { ContextKindConfig, StaticAttribute } from '../types';
import { uid } from '../uid';

function coerce(attr: StaticAttribute): string | number | boolean {
  if (attr.type === 'number') return Number(attr.value);
  if (attr.type === 'boolean') return attr.value.trim().toLowerCase() === 'true';
  return attr.value;
}

function buildSingle(kind: ContextKindConfig, newId: () => string): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  for (const attr of kind.attributes) {
    if (attr.name.trim()) ctx[attr.name.trim()] = coerce(attr);
  }
  // Always set our own key so the SDK never reuses a cached anonymous key.
  ctx.key = `${kind.keyPrefix}${newId()}`;
  if (kind.anonymous) ctx.anonymous = true;
  return ctx;
}

/** One kind gives a single-kind context; several kinds give one multi-context. */
export function buildContext(kinds: ContextKindConfig[], newId: () => string = uid): LDContext {
  if (kinds.length === 1) {
    const [only] = kinds;
    return { kind: only.kind, ...buildSingle(only, newId) } as LDContext;
  }
  const multi: Record<string, unknown> = { kind: 'multi' };
  for (const kind of kinds) multi[kind.kind] = buildSingle(kind, newId);
  return multi as LDContext;
}

/** Short human label for a context, e.g. "user:sim-user-1234 + device:abcd". */
export function describeContext(ctx: LDContext): string {
  const c = ctx as Record<string, unknown>;
  if (c.kind === 'multi') {
    return Object.entries(c)
      .filter(([k]) => k !== 'kind')
      .map(([k, v]) => `${k}:${(v as { key?: string }).key ?? '?'}`)
      .join(' + ');
  }
  return `${String(c.kind ?? 'user')}:${String(c.key)}`;
}
