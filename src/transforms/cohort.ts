import type { SurgeryCase } from '@/data/schema';
import { proportionOf, type ProportionEstimate } from './stats';

export interface PatientProfile {
  age: number;
  bmi: number;
  heightCm: number;
  asa: number;
}

export type MatchCriterion = 'age' | 'bmi' | 'height' | 'asa';

export const MATCH_CRITERIA: readonly MatchCriterion[] = ['age', 'bmi', 'height', 'asa'];

/** Half-widths of the matching window, carried over from the original. */
export const DEFAULT_TOLERANCES = { age: 10, bmi: 8, heightCm: 10, asa: 1 } as const;

/**
 * Cases resembling the profile on every *enabled* criterion.
 *
 * The `active` set is the fix for a real bug in the original: its four
 * checkboxes dimmed the sliders and set `disabled`, but the matcher never
 * received them and always matched on all four. Unchecking BMI changed nothing
 * except the opacity of a control.
 *
 * A case missing the field a criterion tests is excluded rather than admitted.
 * Matching on "age within ten years" cannot be satisfied by a case with no
 * recorded age, and letting it through would pad the cohort with rows that
 * cannot support the estimate drawn from them.
 */
export function matchCohort(
  cases: readonly SurgeryCase[],
  profile: PatientProfile,
  active: ReadonlySet<MatchCriterion>,
  tolerances = DEFAULT_TOLERANCES,
): SurgeryCase[] {
  return cases.filter((c) => {
    if (active.has('age')) {
      if (c.age === null || Math.abs(c.age - profile.age) > tolerances.age) return false;
    }
    if (active.has('bmi')) {
      if (c.bmi === null || Math.abs(c.bmi - profile.bmi) > tolerances.bmi) return false;
    }
    if (active.has('height')) {
      if (c.heightCm === null || Math.abs(c.heightCm - profile.heightCm) > tolerances.heightCm) {
        return false;
      }
    }
    if (active.has('asa')) {
      if (c.asa === null || Math.abs(c.asa - profile.asa) > tolerances.asa) return false;
    }
    return true;
  });
}

export interface OutcomeDefinition {
  key: string;
  label: string;
  /** null where the outcome was not recorded, so it leaves the denominator. */
  test: (c: SurgeryCase) => boolean | null;
}

/**
 * The three radar axes.
 *
 * All three are probabilities of an adverse outcome, deliberately. The original
 * plotted ICU *days*, mortality *percent* and blood loss *millilitres* on one
 * shape — three different units, which makes the polygon's area and shape
 * arbitrary. Reorder the axes and identical data yields a different "risk
 * profile". One unit on every spoke is what makes the shape mean anything.
 */
export const OUTCOMES: readonly OutcomeDefinition[] = [
  {
    key: 'icu',
    label: 'Admitted to ICU',
    test: (c) => (c.icuDays === null ? null : c.icuDays >= 1),
  },
  {
    key: 'mortality',
    label: 'Died in hospital',
    test: (c) => c.diedInHospital,
  },
  {
    key: 'bleeding',
    // 500 mL is a conventional threshold for significant surgical blood loss,
    // and it holds 13.3% of this dataset — frequent enough to estimate, rare
    // enough to discriminate.
    label: 'Blood loss over 500 mL',
    test: (c) => (c.intraopBloodLossMl === null ? null : c.intraopBloodLossMl > 500),
  },
];

export interface RadarAxis {
  key: string;
  label: string;
  /** The cohort's rate. */
  estimate: ProportionEstimate | null;
  /** The same outcome across the whole table, for comparison. */
  baseline: ProportionEstimate | null;
}

export interface CohortSummary {
  size: number;
  axes: RadarAxis[];
}

/**
 * Outcome rates for a cohort, each alongside the dataset-wide rate.
 *
 * Baselines are computed from the whole table rather than assumed, and the
 * chart plots the ratio between them, because the three outcomes differ in
 * frequency by more than an order of magnitude — 18.8% for ICU admission
 * against 0.89% for mortality. On a shared absolute scale the mortality spoke
 * would be invisible at any realistic risk, which is exactly the axis a reader
 * most wants to see move.
 */
export function summariseCohort(
  cohort: readonly SurgeryCase[],
  allCases: readonly SurgeryCase[],
): CohortSummary {
  return {
    size: cohort.length,
    axes: OUTCOMES.map((outcome) => ({
      key: outcome.key,
      label: outcome.label,
      estimate: proportionOf(cohort, outcome.test),
      baseline: proportionOf(allCases, outcome.test),
    })),
  };
}

/**
 * Cohort rate as a multiple of the dataset rate.
 *
 * Returns null when either side is missing or the baseline is zero — a ratio
 * against a zero baseline is infinite rather than large, and drawing it as a
 * maxed-out spoke would assert something the data cannot support.
 */
export function riskRatio(axis: RadarAxis, bound: 'estimate' | 'lower' | 'upper'): number | null {
  const { estimate, baseline } = axis;
  if (estimate === null || baseline === null || baseline.estimate <= 0) return null;
  return estimate[bound] / baseline.estimate;
}

/**
 * Below this the cohort cannot support any of these estimates and the chart
 * refuses to draw a polygon.
 *
 * The original labelled 50 matching cases "Excellent Sample Size … highly
 * reliable" and printed mortality to one decimal place. At 0.89% prevalence,
 * fifty cases distinguish nothing.
 */
export const MINIMUM_COHORT = 25;

export function isCohortPlottable(summary: CohortSummary): boolean {
  return summary.size >= MINIMUM_COHORT;
}
