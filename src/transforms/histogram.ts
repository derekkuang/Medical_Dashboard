import { bin, median } from 'd3-array';
import type { SurgeryCase } from '@/data/schema';

export interface AgeBin {
  /** Inclusive lower edge. */
  x0: number;
  /** Exclusive upper edge, except for the final bin. */
  x1: number;
  count: number;
  male: number;
  female: number;
}

/**
 * Bins cases by age.
 *
 * The domain is a parameter rather than derived from the cases passed in. The
 * container supplies the extent of the *whole* table while passing the
 * *filtered* cohort, so the x-axis stays fixed as filters change. Deriving it
 * from the visible subset would rescale the axis on every interaction, which
 * makes two cohorts impossible to compare by eye — the bars would move even
 * when the underlying counts did not.
 *
 * Cases with no recorded age are dropped rather than bucketed at zero, which
 * would invent a spike of newborns.
 */
export function binAges(
  cases: readonly SurgeryCase[],
  domain: [number, number],
  binCount = 20,
): AgeBin[] {
  const withAge = cases.filter((c): c is SurgeryCase & { age: number } => c.age !== null);

  const binner = bin<SurgeryCase & { age: number }, number>()
    .value((c) => c.age)
    .domain(domain)
    .thresholds(binCount);

  return binner(withAge).map((b) => {
    let male = 0;
    let female = 0;
    for (const c of b) {
      if (c.sex === 'M') male += 1;
      else if (c.sex === 'F') female += 1;
    }

    return {
      // d3 leaves x0/x1 optional in its types; the domain is always supplied
      // here so they are present, and the fallback keeps the value finite
      // rather than propagating undefined into a scale.
      x0: b.x0 ?? domain[0],
      x1: b.x1 ?? domain[1],
      count: b.length,
      male,
      female,
    };
  });
}

/** Tallest bar, used to fix the y domain. Zero for an empty cohort. */
export function maxBinCount(bins: readonly AgeBin[]): number {
  return bins.reduce((max, b) => (b.count > max ? b.count : max), 0);
}

export interface AgeSummary {
  /** Cases with a recorded age. May be fewer than the cohort size. */
  count: number;
  median: number | null;
  min: number | null;
  max: number | null;
}

/**
 * Summary statistics for the chart's accessible description.
 *
 * Median rather than mean: the age distribution is left-skewed by a small
 * number of paediatric cases, and the mean misreports the typical patient. The
 * original hard-coded "median 59.0" as prose, which silently became wrong the
 * moment any filter was applied.
 */
export function summariseAges(cases: readonly SurgeryCase[]): AgeSummary {
  const ages = cases.map((c) => c.age).filter((a): a is number => a !== null);

  if (ages.length === 0) return { count: 0, median: null, min: null, max: null };

  return {
    count: ages.length,
    median: median(ages) ?? null,
    min: Math.min(...ages),
    max: Math.max(...ages),
  };
}
