export interface SearchOption {
  value: string;
  label: string;
  detail?: string;
}

/**
 * Every whitespace-separated term must appear (any order). Exact label/value matches rank
 * first, then prefix matches, then the rest in their original order.
 */
export function rankMatches(options: SearchOption[], query: string): SearchOption[] {
  const terms = query.split(/\s+/).filter(Boolean);
  const score = (o: SearchOption) => {
    const label = o.label.toLowerCase();
    const value = o.value.toLowerCase();
    if (label === query || value === query) return 0;
    if (label.startsWith(query) || value.startsWith(query)) return 1;
    return 2;
  };
  return options
    .filter((o) => {
      const hay = `${o.label} ${o.value} ${o.detail ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .map((o, i) => ({ o, i, s: score(o) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map(({ o }) => o);
}
