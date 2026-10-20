import type { CSSProperties } from 'react';

const VARIATION_COLORS = 6;

/**
 * Sets `--vc` (used by .var-chip and the stats split bar) to the variation's palette color.
 * Unconfigured or index-less variations get no override, so they keep the warning color.
 */
export function variationStyle(index: number | null, configured = true): CSSProperties | undefined {
  if (index === null || !configured) return undefined;
  return { '--vc': `var(--v${index % VARIATION_COLORS})` } as CSSProperties;
}
