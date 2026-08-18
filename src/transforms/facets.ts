import type { SurgeryCase } from '@/data/schema';

/** String-valued fields that can back a categorical filter control. */
export type FacetField = 'department' | 'operationType' | 'anesthesiaType';

export interface Facet {
  value: string;
  count: number;
}

/**
 * Distinct values of a categorical field, with counts.
 *
 * Ordered by frequency, not alphabetically. The distribution here is extremely
 * skewed — 77% of cases are General surgery and the top two departments hold
 * 94.6% — so alphabetical ordering would bury the options that matter behind
 * ones that match a hundred cases. Ties break alphabetically to keep the order
 * stable across reloads.
 *
 * Cases with no recorded value are omitted rather than bucketed under a
 * placeholder: selecting "unknown" as a cohort is not a question anyone is
 * asking of this data.
 */
export function facetCounts(cases: readonly SurgeryCase[], field: FacetField): Facet[] {
  const counts = new Map<string, number>();

  for (const c of cases) {
    const value = c[field];
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Min and max recorded age, or null when nothing has an age.
 *
 * Computed from the data rather than assumed. The original hardcoded a plausible
 * adult range; the real span is 0.3 to 94 years, and clamping a slider to 18+
 * would silently exclude every paediatric case from the cohort.
 */
export function ageExtent(cases: readonly SurgeryCase[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;

  for (const c of cases) {
    if (c.age === null) continue;
    if (c.age < min) min = c.age;
    if (c.age > max) max = c.age;
  }

  return min === Infinity ? null : [min, max];
}
