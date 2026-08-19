import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeCase } from '@/test/factories';
import { parseCases } from '@/data/parseCases';
import {
  MATCH_CRITERIA,
  MINIMUM_COHORT,
  isCohortPlottable,
  matchCohort,
  riskRatio,
  summariseCohort,
  type MatchCriterion,
  type PatientProfile,
} from './cohort';

const PROFILE: PatientProfile = { age: 60, bmi: 25, heightCm: 170, asa: 2 };
const ALL = new Set<MatchCriterion>(MATCH_CRITERIA);

const NEAR = makeCase({ age: 62, bmi: 26, heightCm: 172, asa: 2 });
const FAR_AGE = makeCase({ age: 20, bmi: 26, heightCm: 172, asa: 2 });
const FAR_BMI = makeCase({ age: 62, bmi: 45, heightCm: 172, asa: 2 });

describe('matchCohort', () => {
  it('keeps a case close on every criterion', () => {
    expect(matchCohort([NEAR], PROFILE, ALL)).toHaveLength(1);
  });

  it('rejects a case outside the window on any criterion', () => {
    expect(matchCohort([FAR_AGE], PROFILE, ALL)).toHaveLength(0);
    expect(matchCohort([FAR_BMI], PROFILE, ALL)).toHaveLength(0);
  });

  it('actually stops matching on a disabled criterion', () => {
    // The original's four checkboxes dimmed their sliders but never reached the
    // matcher, so unchecking BMI changed nothing but the opacity of a control.
    const withoutBmi = new Set<MatchCriterion>(['age', 'height', 'asa']);

    expect(matchCohort([FAR_BMI], PROFILE, ALL)).toHaveLength(0);
    expect(matchCohort([FAR_BMI], PROFILE, withoutBmi)).toHaveLength(1);
  });

  it('matches everything when no criterion is enabled', () => {
    const none = new Set<MatchCriterion>();
    expect(matchCohort([FAR_AGE, FAR_BMI], PROFILE, none)).toHaveLength(2);
  });

  it('excludes a case missing the field a criterion tests', () => {
    // "Within ten years of 60" cannot be satisfied by a case with no recorded
    // age, and admitting it would pad the cohort with rows that cannot support
    // the estimate drawn from them.
    const noAge = makeCase({ age: null, bmi: 26, heightCm: 172, asa: 2 });

    expect(matchCohort([noAge], PROFILE, ALL)).toHaveLength(0);
    expect(matchCohort([noAge], PROFILE, new Set(['bmi']))).toHaveLength(1);
  });

  it('treats the tolerance as inclusive', () => {
    const exactlyTen = makeCase({ age: 70, bmi: 25, heightCm: 170, asa: 2 });
    expect(matchCohort([exactlyTen], PROFILE, new Set(['age']))).toHaveLength(1);
  });
});

describe('summariseCohort', () => {
  const cohort = [
    makeCase({ icuDays: 3, diedInHospital: false, intraopBloodLossMl: 100 }),
    makeCase({ icuDays: 0, diedInHospital: false, intraopBloodLossMl: 900 }),
  ];

  it('reports every outcome as a proportion', () => {
    // One unit on every spoke. The original mixed days, percent and millilitres
    // on one shape, which makes its area and orientation meaningless.
    const summary = summariseCohort(cohort, cohort);

    expect(summary.axes.map((a) => a.key)).toEqual(['icu', 'mortality', 'bleeding']);
    expect(summary.axes[0]?.estimate?.estimate).toBe(0.5);
    expect(summary.axes[2]?.estimate?.estimate).toBe(0.5);
  });

  it('excludes unrecorded outcomes from the denominator', () => {
    const withGaps = [...cohort, makeCase({ intraopBloodLossMl: null })];
    const summary = summariseCohort(withGaps, withGaps);

    expect(summary.axes[2]?.estimate?.total).toBe(2);
  });

  it('carries the dataset baseline alongside the cohort', () => {
    const summary = summariseCohort([cohort[0]!], cohort);

    expect(summary.axes[0]?.estimate?.estimate).toBe(1);
    expect(summary.axes[0]?.baseline?.estimate).toBe(0.5);
  });

  it('returns null estimates rather than zeros for an empty cohort', () => {
    const summary = summariseCohort([], cohort);

    expect(summary.size).toBe(0);
    expect(summary.axes.every((a) => a.estimate === null)).toBe(true);
  });
});

describe('riskRatio', () => {
  it('expresses the cohort as a multiple of the baseline', () => {
    const axis = {
      key: 'icu',
      label: 'ICU',
      estimate: { successes: 4, total: 10, estimate: 0.4, lower: 0.2, upper: 0.6 },
      baseline: { successes: 20, total: 100, estimate: 0.2, lower: 0.1, upper: 0.3 },
    };

    expect(riskRatio(axis, 'estimate')).toBeCloseTo(2);
    expect(riskRatio(axis, 'lower')).toBeCloseTo(1);
    expect(riskRatio(axis, 'upper')).toBeCloseTo(3);
  });

  it('refuses a ratio against a zero baseline', () => {
    // Infinite, not large. Drawing it as a maxed spoke would assert something
    // the data cannot support.
    const axis = {
      key: 'x',
      label: 'x',
      estimate: { successes: 1, total: 10, estimate: 0.1, lower: 0, upper: 0.4 },
      baseline: { successes: 0, total: 100, estimate: 0, lower: 0, upper: 0.03 },
    };

    expect(riskRatio(axis, 'estimate')).toBeNull();
  });

  it('returns null when either side is missing', () => {
    expect(
      riskRatio({ key: 'x', label: 'x', estimate: null, baseline: null }, 'estimate'),
    ).toBeNull();
  });
});

describe('isCohortPlottable', () => {
  it('refuses to plot a cohort too small to support the estimates', () => {
    expect(isCohortPlottable({ size: MINIMUM_COHORT - 1, axes: [] })).toBe(false);
    expect(isCohortPlottable({ size: MINIMUM_COHORT, axes: [] })).toBe(true);
  });
});

describe('cohort matching against the published VitalDB table', () => {
  const csv = readFileSync(resolve(process.cwd(), 'public/cases.csv'), 'utf8');
  const { cases } = parseCases(csv);

  it('reproduces the dataset baselines', () => {
    const summary = summariseCohort(cases, cases);
    const [icu, mortality, bleeding] = summary.axes;

    expect(icu?.baseline?.estimate).toBeCloseTo(0.188, 2);
    expect(mortality?.baseline?.estimate).toBeCloseTo(0.0089, 3);
    expect(bleeding?.baseline?.estimate).toBeCloseTo(0.133, 2);
  });

  it('finds a usable cohort for a typical patient', () => {
    const cohort = matchCohort(cases, PROFILE, ALL);

    expect(cohort.length).toBeGreaterThan(MINIMUM_COHORT);
  });

  it('narrows sharply as criteria are added', () => {
    const onlyAge = matchCohort(cases, PROFILE, new Set(['age']));
    const everything = matchCohort(cases, PROFILE, ALL);

    expect(everything.length).toBeLessThan(onlyAge.length);
  });

  it('leaves an extreme profile too small to plot', () => {
    // The honest outcome for an unusual patient, and the one the original hid
    // behind a confident triangle.
    const extreme: PatientProfile = { age: 2, bmi: 14, heightCm: 90, asa: 5 };
    const summary = summariseCohort(matchCohort(cases, extreme, ALL), cases);

    expect(isCohortPlottable(summary)).toBe(false);
  });

  it('shows a sicker profile carrying more risk than the baseline', () => {
    const sick: PatientProfile = { age: 78, bmi: 20, heightCm: 160, asa: 4 };
    const summary = summariseCohort(matchCohort(cases, sick, ALL), cases);
    const icu = summary.axes[0];

    expect(riskRatio(icu!, 'estimate')).toBeGreaterThan(1);
  });
});
