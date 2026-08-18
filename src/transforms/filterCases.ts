import type { Sex, SurgeryCase } from '@/data/schema';

/**
 * The cohort selection, as a plain value.
 *
 * Deliberately defined here rather than in the Redux slice so the dependency
 * runs feature -> transform. The slice adopts this as its state shape, which
 * means the filtering logic stays testable without a store.
 */
export interface CaseFilters {
  department: string | null;
  /** Inclusive at both ends. */
  ageRange: [number, number] | null;
  sex: Sex | null;
  operationType: string | null;
  emergencyOnly: boolean;
}

export const NO_FILTERS: CaseFilters = {
  department: null,
  ageRange: null,
  sex: null,
  operationType: null,
  emergencyOnly: false,
};

/**
 * A filter is a positive assertion, so a case whose value is unrecorded fails
 * it. Selecting "Female" must not quietly include the cases whose sex was never
 * recorded — that would inflate the cohort with rows that cannot support the
 * claim being made about it.
 */
export function matchesFilters(c: SurgeryCase, f: CaseFilters): boolean {
  if (f.department !== null && c.department !== f.department) return false;
  if (f.sex !== null && c.sex !== f.sex) return false;
  if (f.operationType !== null && c.operationType !== f.operationType) return false;
  if (f.emergencyOnly && c.isEmergency !== true) return false;

  if (f.ageRange !== null) {
    if (c.age === null) return false;
    const [lo, hi] = f.ageRange;
    if (c.age < lo || c.age > hi) return false;
  }

  return true;
}

/**
 * One predicate over one authoritative filter set.
 *
 * The original kept a mutable `filteredCases` in component state and fed it
 * back into two children under different conditions, so brushing an age range
 * collapsed the very selection that produced it. Deriving from a single source
 * makes that bug unrepresentable rather than merely fixed.
 */
export function filterCases(cases: readonly SurgeryCase[], f: CaseFilters): SurgeryCase[] {
  return cases.filter((c) => matchesFilters(c, f));
}

/** Drives the "N filters active" affordance and the clear-all button. */
export function countActiveFilters(f: CaseFilters): number {
  let n = 0;
  if (f.department !== null) n += 1;
  if (f.ageRange !== null) n += 1;
  if (f.sex !== null) n += 1;
  if (f.operationType !== null) n += 1;
  if (f.emergencyOnly) n += 1;
  return n;
}
