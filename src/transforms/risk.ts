import type { SurgeryCase } from '@/data/schema';
import { proportionOf, type ProportionEstimate } from './stats';

export type RiskFactorKey = 'highAsa' | 'emergency' | 'lowAlbumin' | 'olderThan65';

export interface RiskFactorDefinition {
  key: RiskFactorKey;
  label: string;
  /**
   * Returns null when the underlying field was never recorded. A patient whose
   * albumin was not measured is not a patient with normal albumin, and folding
   * the two together is how a risk factor's apparent effect gets diluted.
   */
  test: (c: SurgeryCase) => boolean | null;
}

export const RISK_FACTORS: readonly RiskFactorDefinition[] = [
  {
    key: 'highAsa',
    label: 'ASA 3 or above',
    test: (c) => (c.asa === null ? null : c.asa >= 3),
  },
  {
    key: 'emergency',
    label: 'Emergency operation',
    test: (c) => c.isEmergency,
  },
  {
    key: 'lowAlbumin',
    label: 'Albumin below 3.5 g/dL',
    test: (c) => (c.preopAlbuminGdl === null ? null : c.preopAlbuminGdl < 3.5),
  },
  {
    key: 'olderThan65',
    label: 'Older than 65',
    test: (c) => (c.age === null ? null : c.age > 65),
  },
];

const died = (c: SurgeryCase): boolean | null => c.diedInHospital;

export interface RiskRow {
  key: string;
  label: string;
  /** Observed in-hospital mortality for this group, with a Wilson interval. */
  estimate: ProportionEstimate | null;
}

export interface RiskCombination {
  factors: RiskFactorKey[];
  /** Mortality actually observed among patients with all the selected factors. */
  observed: ProportionEstimate | null;
  /**
   * What an additive model predicts: baseline plus each selected factor's
   * marginal difference. Reported so the chart can show it against the observed
   * value rather than in place of it.
   */
  additivePrediction: number | null;
}

export interface RiskProfile {
  rows: RiskRow[];
  combination: RiskCombination | null;
}

/** Cases where every factor is recorded and false. */
function baselineCohort(cases: readonly SurgeryCase[]): SurgeryCase[] {
  return cases.filter((c) => RISK_FACTORS.every((f) => f.test(c) === false));
}

/**
 * Observed mortality by risk factor, plus the selected combination.
 *
 * This replaces the original's additive waterfall, which took each factor's
 * marginal difference in mortality and summed them onto a baseline. That model
 * is wrong on this data and demonstrably so: baseline 0.4% plus the four
 * marginal contributions predicts about 11.7%, while the patients who actually
 * have all four die at about 19.6%. It was also biased upward by construction,
 * because contributions were clamped at zero — no factor could ever be
 * protective — and it presented unadjusted differences between heavily
 * overlapping subgroups as though they decomposed.
 *
 * What is reported instead is what was observed, with the uncertainty attached.
 * The additive prediction is still computed, so the chart can show the gap
 * rather than quietly dropping the claim.
 */
export function riskProfile(
  cases: readonly SurgeryCase[],
  selected: readonly RiskFactorKey[],
): RiskProfile {
  const rows: RiskRow[] = [
    {
      key: 'baseline',
      label: 'None of these factors',
      estimate: proportionOf(baselineCohort(cases), died),
    },
    ...RISK_FACTORS.map((factor) => ({
      key: factor.key,
      label: factor.label,
      estimate: proportionOf(
        cases.filter((c) => factor.test(c) === true),
        died,
      ),
    })),
  ];

  if (selected.length === 0) {
    return { rows, combination: null };
  }

  const chosen = RISK_FACTORS.filter((f) => selected.includes(f.key));
  const withAll = cases.filter((c) => chosen.every((f) => f.test(c) === true));

  return {
    rows,
    combination: {
      factors: chosen.map((f) => f.key),
      observed: proportionOf(withAll, died),
      additivePrediction: additivePrediction(cases, chosen),
    },
  };
}

/**
 * Reproduces the original's model so its output can be shown against reality.
 *
 * Kept faithful to the original, clamp included: contributions were floored at
 * zero, which guarantees no factor can reduce risk and biases the total upward.
 */
function additivePrediction(
  cases: readonly SurgeryCase[],
  chosen: readonly RiskFactorDefinition[],
): number | null {
  const baseline = proportionOf(baselineCohort(cases), died);
  if (baseline === null) return null;

  let total = baseline.estimate;

  for (const factor of chosen) {
    const withFactor = proportionOf(
      cases.filter((c) => factor.test(c) === true),
      died,
    );
    const withoutFactor = proportionOf(
      cases.filter((c) => factor.test(c) === false),
      died,
    );
    if (withFactor === null || withoutFactor === null) continue;

    total += Math.max(0, withFactor.estimate - withoutFactor.estimate);
  }

  return total;
}
