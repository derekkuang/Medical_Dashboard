import { describe, it, expect } from 'vitest';
import { intervalWidth, isEstimateReportable, proportionOf, wilsonInterval } from './stats';

describe('wilsonInterval', () => {
  it('matches published values', () => {
    // Reference figures for the Wilson score interval at 95%.
    const half = wilsonInterval(5, 10)!;
    expect(half.lower).toBeCloseTo(0.236593, 6);
    expect(half.upper).toBeCloseTo(0.763407, 6);

    const one = wilsonInterval(1, 10)!;
    expect(one.lower).toBeCloseTo(0.017876, 6);
    expect(one.upper).toBeCloseTo(0.40415, 5);
  });

  it('gives a usable interval when nothing happened', () => {
    // The Wald interval returns 0 to 0 here, asserting certainty that the true
    // rate is exactly zero on the strength of 51 patients. This is the single
    // most important reason for choosing Wilson in this dataset.
    const none = wilsonInterval(0, 51)!;

    expect(none.estimate).toBe(0);
    expect(none.lower).toBe(0);
    expect(none.upper).toBeCloseTo(0.070047, 6);
  });

  it('never returns a probability outside zero and one', () => {
    // Wald routinely produces negative lower bounds near zero.
    for (const [s, n] of [
      [0, 5],
      [1, 3],
      [5, 5],
      [1, 10000],
      [9999, 10000],
    ] as const) {
      const estimate = wilsonInterval(s, n)!;
      expect(estimate.lower).toBeGreaterThanOrEqual(0);
      expect(estimate.upper).toBeLessThanOrEqual(1);
    }
  });

  it('brackets the point estimate', () => {
    const estimate = wilsonInterval(57, 6255)!;

    expect(estimate.estimate).toBeCloseTo(0.009113, 6);
    expect(estimate.lower).toBeLessThan(estimate.estimate);
    expect(estimate.upper).toBeGreaterThan(estimate.estimate);
  });

  it('reproduces the dataset-wide mortality interval', () => {
    // 57 in-hospital deaths among the 6,255 cases with a recorded outcome.
    const estimate = wilsonInterval(57, 6255)!;

    expect(estimate.lower).toBeCloseTo(0.007041, 6);
    expect(estimate.upper).toBeCloseTo(0.011787, 6);
  });

  it('narrows as the cohort grows', () => {
    const small = wilsonInterval(5, 50)!;
    const large = wilsonInterval(500, 5000)!;

    expect(intervalWidth(large)).toBeLessThan(intervalWidth(small));
  });

  it('returns null rather than NaN for an empty cohort', () => {
    // NaN would flow into a scale and render as an invisible mark.
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(3, -1)).toBeNull();
  });
});

describe('proportionOf', () => {
  it('counts a binary outcome across a cohort', () => {
    const estimate = proportionOf([1, 2, 3, 4], (n) => n % 2 === 0)!;

    expect(estimate.successes).toBe(2);
    expect(estimate.total).toBe(4);
  });

  it('excludes unrecorded outcomes from the denominator', () => {
    // Counting "not recorded" as "did not happen" understates every rate. That
    // is exactly how the original produced its figures, by reading a missing
    // value as 0.
    const estimate = proportionOf([true, null, false, null], (v) => v)!;

    expect(estimate.successes).toBe(1);
    expect(estimate.total).toBe(2);
    expect(estimate.estimate).toBe(0.5);
  });

  it('returns null when nothing has a recorded outcome', () => {
    expect(proportionOf([null, null], (v) => v)).toBeNull();
  });

  it('returns null for an empty cohort', () => {
    expect(proportionOf([], () => true)).toBeNull();
  });
});

describe('isEstimateReportable', () => {
  it('rejects an estimate too wide to state as a number', () => {
    // One death in 50 gives 0.4% to 10.5%. The original labelled this
    // "Excellent Sample Size … highly reliable" and printed one decimal place.
    const fifty = wilsonInterval(1, 50)!;

    expect(intervalWidth(fifty)).toBeGreaterThan(0.1);
    expect(isEstimateReportable(fifty)).toBe(false);
  });

  it('accepts an estimate from a cohort large enough to support it', () => {
    expect(isEstimateReportable(wilsonInterval(57, 6255))).toBe(true);
  });

  it('rejects a missing estimate', () => {
    expect(isEstimateReportable(null)).toBe(false);
  });

  it('takes the threshold as a parameter rather than hiding it', () => {
    const fifty = wilsonInterval(1, 50)!;

    expect(isEstimateReportable(fifty, 0.05)).toBe(false);
    expect(isEstimateReportable(fifty, 0.5)).toBe(true);
  });
});
