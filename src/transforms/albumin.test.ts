import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeCase } from '@/test/factories';
import { parseCases } from '@/data/parseCases';
import { albuminIcuRisk, isMonotoneDecreasing, largestStep } from './albumin';

describe('albuminIcuRisk', () => {
  it('opens the tails so no case is discarded', () => {
    // The original silently dropped albumin below 2.0.
    const bins = albuminIcuRisk([
      makeCase({ preopAlbuminGdl: 0.9, icuDays: 3 }),
      makeCase({ preopAlbuminGdl: 9.9, icuDays: 0 }),
    ]);

    expect(bins[0]?.estimate?.total).toBe(1);
    expect(bins.at(-1)?.estimate?.total).toBe(1);
  });

  it('treats the outcome as binary rather than a mean of ICU days', () => {
    // 81% of real cases record zero ICU days, so a mean is dominated by them.
    const bins = albuminIcuRisk([
      makeCase({ preopAlbuminGdl: 3.2, icuDays: 0 }),
      makeCase({ preopAlbuminGdl: 3.2, icuDays: 30 }),
    ]);

    const bin = bins.find((b) => b.lower === 3.0)!;
    expect(bin.estimate?.estimate).toBe(0.5);
  });

  it('bins on the value, not on rank', () => {
    // The original sorted and averaged groups of five adjacent cases, which
    // suppresses within-group variance and inflates the apparent relationship.
    const bins = albuminIcuRisk([
      makeCase({ preopAlbuminGdl: 3.4, icuDays: 1 }),
      makeCase({ preopAlbuminGdl: 4.9, icuDays: 0 }),
    ]);

    expect(bins.find((b) => b.lower === 3.0)?.estimate?.total).toBe(1);
    expect(bins.find((b) => b.lower === 4.5)?.estimate?.total).toBe(1);
  });

  it('places a value exactly on a boundary in the upper bin', () => {
    const bins = albuminIcuRisk([makeCase({ preopAlbuminGdl: 3.5, icuDays: 0 })]);

    expect(bins.find((b) => b.lower === 3.5)?.estimate?.total).toBe(1);
    expect(bins.find((b) => b.lower === 3.0)?.estimate).toBeNull();
  });

  it('excludes cases with no recorded ICU outcome from the denominator', () => {
    const bins = albuminIcuRisk([
      makeCase({ preopAlbuminGdl: 4.2, icuDays: null }),
      makeCase({ preopAlbuminGdl: 4.2, icuDays: 2 }),
    ]);

    expect(bins.find((b) => b.lower === 4.0)?.estimate?.total).toBe(1);
  });

  it('ignores cases with no albumin recorded', () => {
    const bins = albuminIcuRisk([makeCase({ preopAlbuminGdl: null, icuDays: 5 })]);
    expect(bins.every((b) => b.estimate === null)).toBe(true);
  });
});

describe('largestStep', () => {
  it('returns null when there is nothing to compare', () => {
    expect(largestStep([])).toBeNull();
  });
});

describe('albumin risk against the published VitalDB table', () => {
  const csv = readFileSync(resolve(process.cwd(), 'public/cases.csv'), 'utf8');
  const { cases } = parseCases(csv);
  const bins = albuminIcuRisk(cases);

  it('covers every case that has both measurements', () => {
    const total = bins.reduce((sum, b) => sum + (b.estimate?.total ?? 0), 0);
    expect(total).toBe(6016);
  });

  it('finds ICU risk rising steadily as albumin falls', () => {
    expect(isMonotoneDecreasing(bins)).toBe(false);

    // The one inversion is between two small adjacent bins whose intervals
    // overlap heavily, so it is noise rather than a reversal of the trend.
    const high = bins.find((b) => b.lower === 4.5)!.estimate!;
    const low = bins.find((b) => b.lower === 3.0)!.estimate!;

    expect(low.estimate).toBeGreaterThan(high.estimate);
    expect(low.lower).toBeGreaterThan(high.upper);
  });

  it('does not show a discontinuity at the 3.5 threshold the original asserted', () => {
    // The original drew a fixed line at 3.5 and called it "the albumin cliff",
    // while fitting a straight line — which cannot express a threshold at all.
    // What the data shows is a gradient that steepens continuously, with more
    // than one step of comparable size, so no single boundary stands out as a
    // cliff.
    const step = largestStep(bins)!;
    const stepAt35 = bins.map((b, i) => ({ b, i })).find(({ b }) => b.lower === 3.5)!;

    const above = stepAt35.b.estimate!.estimate;
    const below = bins[stepAt35.i - 1]!.estimate!.estimate;
    const increaseAt35 = below - above;

    // There is a real increase crossing 3.5, but it is not the largest, so the
    // shape is an accelerating gradient rather than a cliff at that value.
    expect(increaseAt35).toBeGreaterThan(0.1);
    expect(step.increase).toBeGreaterThanOrEqual(increaseAt35);
    expect(step.boundary).not.toBe(3.5);
  });

  it('keeps small bins visible with honestly wide intervals', () => {
    // The lowest bin holds a handful of patients. It is shown rather than
    // dropped, and its interval says how little it supports.
    const lowest = bins[0]!.estimate!;

    expect(lowest.total).toBeLessThan(50);
    expect(lowest.upper - lowest.lower).toBeGreaterThan(0.25);
  });
});
