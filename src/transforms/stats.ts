/** 95% two-sided normal quantile. */
export const Z_95 = 1.959963984540054;

export interface ProportionEstimate {
  successes: number;
  total: number;
  /** Point estimate, successes / total. */
  estimate: number;
  /** Wilson score interval, clamped to [0, 1]. */
  lower: number;
  upper: number;
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * Wilson rather than the textbook normal approximation (Wald), because this
 * dataset lives exactly where Wald fails. In-hospital mortality is 57 of 6,255
 * cases — 0.9% — and users can filter down to cohorts of a few dozen. At those
 * proportions and sample sizes Wald is not merely imprecise, it is incoherent:
 *
 *   - For 0 successes it returns a zero-width interval, claiming certainty that
 *     the true rate is exactly 0 from a cohort of 51 patients. Wilson gives
 *     0% to 7.0%, which is the honest answer.
 *   - Near zero it routinely produces a negative lower bound, a probability
 *     below zero.
 *
 * Wilson has neither failure: it is always inside [0, 1] and never degenerate.
 *
 * Returns null for an empty cohort rather than NaN, so callers must decide what
 * to show when there is nothing to estimate from.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z: number = Z_95,
): ProportionEstimate | null {
  if (total <= 0) return null;

  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const halfWidth =
    (z / denominator) * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));

  return {
    successes,
    total,
    estimate: p,
    lower: Math.max(0, centre - halfWidth),
    upper: Math.min(1, centre + halfWidth),
  };
}

/**
 * Counts a binary outcome over a cohort and returns its interval.
 *
 * The predicate returns null for "not recorded", which is excluded from the
 * denominator rather than counted as a negative. Treating an unrecorded outcome
 * as "did not happen" understates every rate, and is precisely how the original
 * arrived at its numbers — it read a missing value as 0.
 */
export function proportionOf<T>(
  items: readonly T[],
  predicate: (item: T) => boolean | null,
): ProportionEstimate | null {
  let successes = 0;
  let total = 0;

  for (const item of items) {
    const outcome = predicate(item);
    if (outcome === null) continue;
    total += 1;
    if (outcome) successes += 1;
  }

  return wilsonInterval(successes, total);
}

/**
 * Width of an interval, as a share of the whole probability scale.
 *
 * Used to decide when an estimate is too uncertain to present as a number. A
 * cohort of 50 with one death gives 0.4%–10.5%: a 10-point spread that no
 * amount of decimal places in the point estimate can justify.
 */
export function intervalWidth(estimate: ProportionEstimate): number {
  return estimate.upper - estimate.lower;
}

/**
 * Whether an estimate is precise enough to state as a value.
 *
 * The threshold is a judgement, not a law, and it is deliberately explicit
 * rather than buried in a component. The original displayed one-decimal
 * mortality rates for cohorts of 10 and labelled 50 cases "highly reliable";
 * at 0.9% prevalence a 50-case cohort cannot distinguish 0% from 7%.
 */
export function isEstimateReportable(
  estimate: ProportionEstimate | null,
  maxWidth = 0.1,
): estimate is ProportionEstimate {
  return estimate !== null && intervalWidth(estimate) <= maxWidth;
}
