import { describe, it, expect } from 'vitest';
import { makeCase } from '@/test/factories';
import { binAges, maxBinCount, summariseAges } from './histogram';

describe('binAges', () => {
  it('counts cases into bins', () => {
    const cases = [
      makeCase({ age: 5 }),
      makeCase({ age: 15 }),
      makeCase({ age: 16 }),
      makeCase({ age: 95 }),
    ];

    const bins = binAges(cases, [0, 100], 10);
    const total = bins.reduce((sum, b) => sum + b.count, 0);

    expect(total).toBe(4);
    expect(bins.find((b) => b.x0 === 10)?.count).toBe(2);
  });

  it('keeps the domain fixed regardless of the cases supplied', () => {
    // The container passes the whole table's extent with a filtered cohort, so
    // the axis does not rescale on every interaction. Without this, two cohorts
    // cannot be compared by eye — bars move even when counts do not.
    const narrow = binAges([makeCase({ age: 50 })], [0, 100], 10);

    expect(narrow[0]?.x0).toBe(0);
    expect(narrow.at(-1)?.x1).toBe(100);
  });

  it('drops cases with no recorded age rather than bucketing them at zero', () => {
    // Bucketing null at 0 would invent a spike of newborns.
    const bins = binAges([makeCase({ age: null }), makeCase({ age: 50 })], [0, 100], 10);

    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(1);
    expect(bins[0]?.count).toBe(0);
  });

  it('splits each bin by sex', () => {
    const cases = [
      makeCase({ age: 50, sex: 'M' }),
      makeCase({ age: 52, sex: 'F' }),
      makeCase({ age: 54, sex: 'F' }),
    ];

    const bin = binAges(cases, [50, 60], 1).find((b) => b.count > 0);

    expect(bin?.male).toBe(1);
    expect(bin?.female).toBe(2);
  });

  it('counts a case with unrecorded sex in the total but in neither split', () => {
    // The parts must not silently sum to the whole when sex is missing —
    // a stacked bar drawn from male+female would be shorter than the count.
    const bins = binAges([makeCase({ age: 50, sex: null })], [50, 60], 1);
    const bin = bins.find((b) => b.count > 0);

    expect(bin?.count).toBe(1);
    expect(bin?.male).toBe(0);
    expect(bin?.female).toBe(0);
  });

  it('handles an empty cohort without throwing', () => {
    const bins = binAges([], [0, 100], 10);

    expect(bins.length).toBeGreaterThan(0);
    expect(bins.every((b) => b.count === 0)).toBe(true);
  });

  it('produces finite edges for every bin', () => {
    // NaN or undefined edges reach a scale and render as invisible geometry.
    const bins = binAges([makeCase({ age: 0.3 }), makeCase({ age: 94 })], [0.3, 94], 20);

    expect(bins.every((b) => Number.isFinite(b.x0) && Number.isFinite(b.x1))).toBe(true);
  });
});

describe('maxBinCount', () => {
  it('returns the tallest bar', () => {
    expect(maxBinCount([{ x0: 0, x1: 1, count: 3, male: 0, female: 0 }])).toBe(3);
  });

  it('returns zero for an empty cohort', () => {
    // Callers fix the y domain from this, and a scale over [0, 0] is degenerate.
    expect(maxBinCount([])).toBe(0);
  });
});

describe('summariseAges', () => {
  it('reports the median of the recorded ages', () => {
    const cases = [makeCase({ age: 10 }), makeCase({ age: 20 }), makeCase({ age: 60 })];
    expect(summariseAges(cases).median).toBe(20);
  });

  it('counts only cases with a recorded age', () => {
    // The summary is read out as the chart's description, so it must not claim
    // more cases than actually contributed to the bars.
    const summary = summariseAges([makeCase({ age: 40 }), makeCase({ age: null })]);

    expect(summary.count).toBe(1);
    expect(summary.min).toBe(40);
    expect(summary.max).toBe(40);
  });

  it('returns nulls rather than zeros when nothing has an age', () => {
    // Zero would be read out as "median 0 years", which is a claim about
    // newborns rather than an absence of data.
    expect(summariseAges([makeCase({ age: null })])).toEqual({
      count: 0,
      median: null,
      min: null,
      max: null,
    });
  });

  it('prefers the median to the mean on this skewed distribution', () => {
    // A handful of paediatric cases drag the mean well below the typical
    // patient; the median is unmoved.
    const cases = [
      makeCase({ age: 0.3 }),
      makeCase({ age: 0.5 }),
      makeCase({ age: 60 }),
      makeCase({ age: 62 }),
      makeCase({ age: 64 }),
    ];

    expect(summariseAges(cases).median).toBe(60);
  });
});
