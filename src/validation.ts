import type { SimConfig } from './types';

const KIND_RE = /^[a-zA-Z0-9._-]+$/;
const RESERVED_ATTRS = new Set(['kind', 'key', 'anonymous', '_meta']);

/** Returns a list of human-readable problems; empty means the config can run. */
export function validateConfig(c: SimConfig): string[] {
  const errors: string[] = [];

  if (!c.clientSideId.trim()) errors.push('Client-side ID is required.');
  if (!c.flagKey.trim()) errors.push('Flag key is required.');
  if (c.eventKeys.length === 0) errors.push('Add at least one event key.');

  if (c.contextKinds.length === 0) errors.push('Add at least one context kind.');
  const kindNames = new Set<string>();
  c.contextKinds.forEach((k, i) => {
    const label = k.kind || `#${i + 1}`;
    if (!k.kind) errors.push(`Context kind #${i + 1} needs a name.`);
    else if (k.kind === 'kind' || k.kind === 'multi' || !KIND_RE.test(k.kind))
      errors.push(`Context kind "${k.kind}" is invalid (letters, numbers, ".", "_", "-"; not "kind" or "multi").`);
    if (kindNames.has(k.kind)) errors.push(`Context kind "${k.kind}" is listed twice.`);
    kindNames.add(k.kind);

    const attrNames = new Set<string>();
    k.attributes.forEach((a) => {
      const name = a.name.trim();
      if (!name) return errors.push(`An attribute on "${label}" has no name.`);
      if (RESERVED_ATTRS.has(name)) errors.push(`"${name}" is reserved and can't be an attribute on "${label}".`);
      if (attrNames.has(name)) errors.push(`Attribute "${name}" is listed twice on "${label}".`);
      attrNames.add(name);
      if (a.type === 'number' && (a.value.trim() === '' || !Number.isFinite(Number(a.value))))
        errors.push(`Attribute "${name}" on "${label}" must be a number.`);
      if (a.type === 'boolean' && !['true', 'false'].includes(a.value.trim().toLowerCase()))
        errors.push(`Attribute "${name}" on "${label}" must be true or false.`);
    });
  });

  if (c.variations.length === 0) errors.push('Add at least one variation.');
  const indexes = new Set<number>();
  c.variations.forEach((v) => {
    const label = v.label || `index ${v.index}`;
    if (!Number.isInteger(v.index) || v.index < 0)
      errors.push(`Variation "${label}" needs a whole-number index of 0 or more.`);
    if (indexes.has(v.index)) errors.push(`Variation index ${v.index} is listed twice.`);
    indexes.add(v.index);
    for (const key of c.eventKeys) {
      const r = v.rates[key] ?? 0;
      if (!(r >= 0 && r <= 100)) errors.push(`Rate for "${label}" on "${key}" must be 0–100.`);
    }
  });

  if (!(Number.isFinite(c.intervalMs) && c.intervalMs >= 0))
    errors.push('Milliseconds between calls must be 0 or more.');
  if (c.maxContexts !== null && !(Number.isInteger(c.maxContexts) && c.maxContexts >= 1))
    errors.push('"Stop after" must be a whole number of 1 or more, or empty.');

  return errors;
}
