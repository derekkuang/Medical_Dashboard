import type { SurgeryCase } from '@/data/schema';
import { proportionOf, type ProportionEstimate } from './stats';

/**
 * Bin boundaries in g/dL, with open tails below the first and above the last.
 * 3.5 is included because it is the threshold the original asserted, so the
 * chart can be read directly against that claim.
 */
export const DEFAULT_ALBUMIN_EDGES = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0] as const;

export interface AlbuminBin {
  /** null on the open lower tail. */
  lower: number | null;
  /** null on the open upper tail. */
  upper: number | null;
  label: string;
  /** Share of the bin admitted to ICU, with a 95% interval. */
  estimate: ProportionEstimate | null;
}

/** Any recorded ICU stay. null when the field was not recorded. */
function admittedToIcu(c: SurgeryCase): boolean | null {
  return c.icuDays === null ? null : c.icuDays >= 1;
}

function labelFor(lower: number | null, upper: number | null): string {
  if (lower === null) return `below ${String(upper)}`;
  if (upper === null) return `${String(lower)} and above`;
  return `${lower.toFixed(1)} to ${upper.toFixed(1)}`;
}

/**
 * Proportion of patients admitted to ICU, by pre-operative albumin.
 *
 * Three deliberate departures from the original.
 *
 * The outcome is binary — admitted to ICU or not — rather than a mean number of
 * ICU days. 81% of cases record zero ICU days, so a mean is dominated by them
 * and moves for reasons that have nothing to do with albumin. A proportion also
 * comes with an honest interval; a mean of mostly-zeros does not.
 *
 * Cases are binned by albumin value, not sorted and grouped in fives. The
 * original averaged both axes within groups of five adjacent cases, which
 * suppresses within-group variance and makes any relationship look far tighter
 * than it is — the correlation you see is partly an artefact of the smoothing.
 *
 * Nothing is dropped. The original silently discarded albumin below 2.0 and,
 * inconsistently, removed high-ICU groups from two of its three views but not
 * the third — so the "elective" view was drawn under different rules from the
 * others without saying so.
 */
export function albuminIcuRisk(
  cases: readonly SurgeryCase[],
  edges: readonly number[] = DEFAULT_ALBUMIN_EDGES,
): AlbuminBin[] {
  const withAlbumin = cases.filter(
    (c): c is SurgeryCase & { preopAlbuminGdl: number } => c.preopAlbuminGdl !== null,
  );

  const bounds: [number | null, number | null][] = [
    [null, edges[0] ?? null],
    ...edges
      .slice(0, -1)
      .map((lo, i): [number | null, number | null] => [lo, edges[i + 1] ?? null]),
    [edges.at(-1) ?? null, null],
  ];

  return bounds.map(([lower, upper]) => {
    const inBin = withAlbumin.filter((c) => {
      const v = c.preopAlbuminGdl;
      if (lower !== null && v < lower) return false;
      if (upper !== null && v >= upper) return false;
      return true;
    });

    return {
      lower,
      upper,
      label: labelFor(lower, upper),
      estimate: proportionOf(inBin, admittedToIcu),
    };
  });
}

export interface AlbuminStep {
  /** Boundary between the two bins, in g/dL. */
  boundary: number;
  /** Increase in ICU rate moving from the higher bin down to the lower one. */
  increase: number;
}

/**
 * The largest jump between adjacent bins, moving down the albumin scale.
 *
 * Computed rather than asserted. The original drew a fixed line at 3.5 g/dL and
 * called it "the albumin cliff", while fitting a straight line through the data
 * — and a straight line cannot express a threshold at all. Reporting where the
 * steepest step actually falls lets the chart describe the shape it has instead
 * of the shape it was captioned with.
 */
export function largestStep(bins: readonly AlbuminBin[]): AlbuminStep | null {
  let best: AlbuminStep | null = null;

  for (let i = 1; i < bins.length; i += 1) {
    const lowerBin = bins[i - 1];
    const higherBin = bins[i];
    if (lowerBin?.estimate == null || higherBin?.estimate == null) continue;

    const boundary = higherBin.lower;
    if (boundary === null) continue;

    const increase = lowerBin.estimate.estimate - higherBin.estimate.estimate;
    if (best === null || increase > best.increase) best = { boundary, increase };
  }

  return best;
}

/**
 * Whether the trend is monotone: every step down in albumin raises the rate.
 *
 * A genuine threshold effect would show as one dominant step against a flat
 * background. A monotone, steadily accelerating gradient is a different claim
 * and should be described differently.
 */
export function isMonotoneDecreasing(bins: readonly AlbuminBin[]): boolean {
  const rates = bins.map((b) => b.estimate?.estimate).filter((r): r is number => r !== undefined);

  return rates.every((rate, i) => {
    const previous = rates[i - 1];
    return previous === undefined || previous >= rate;
  });
}
