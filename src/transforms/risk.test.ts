import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeCase } from '@/test/factories';
import { parseCases } from '@/data/parseCases';
import { RISK_FACTORS, riskProfile } from './risk';

describe('RISK_FACTORS', () => {
  it('reports an unrecorded field as unknown, not as absent', () => {
    // A patient whose albumin was never measured is not a patient with normal
    // albumin. Folding the two together dilutes the factor's apparent effect.
    const unmeasured = makeCase({ preopAlbuminGdl: null, asa: null, age: null });

    for (const factor of RISK_FACTORS) {
      expect(factor.test(unmeasured)).toBeNull();
    }
  });

  it('applies the documented thresholds', () => {
    const asa = RISK_FACTORS.find((f) => f.key === 'highAsa')!;
    expect(asa.test(makeCase({ asa: 2 }))).toBe(false);
    expect(asa.test(makeCase({ asa: 3 }))).toBe(true);

    const albumin = RISK_FACTORS.find((f) => f.key === 'lowAlbumin')!;
    expect(albumin.test(makeCase({ preopAlbuminGdl: 3.5 }))).toBe(false);
    expect(albumin.test(makeCase({ preopAlbuminGdl: 3.49 }))).toBe(true);

    const age = RISK_FACTORS.find((f) => f.key === 'olderThan65')!;
    expect(age.test(makeCase({ age: 65 }))).toBe(false);
    expect(age.test(makeCase({ age: 66 }))).toBe(true);
  });
});

describe('riskProfile', () => {
  it('reports a baseline plus one row per factor', () => {
    const profile = riskProfile([], []);

    expect(profile.rows.map((r) => r.key)).toEqual([
      'baseline',
      'highAsa',
      'emergency',
      'lowAlbumin',
      'olderThan65',
    ]);
  });

  it('has no combination until a factor is chosen', () => {
    expect(riskProfile([], []).combination).toBeNull();
  });

  it('attaches an interval to every estimate rather than a bare rate', () => {
    const cases = [
      makeCase({ asa: 3, isEmergency: false, preopAlbuminGdl: 4, age: 40, diedInHospital: true }),
      makeCase({ asa: 3, isEmergency: false, preopAlbuminGdl: 4, age: 40, diedInHospital: false }),
    ];

    const asaRow = riskProfile(cases, []).rows.find((r) => r.key === 'highAsa')!;

    expect(asaRow.estimate?.estimate).toBe(0.5);
    expect(asaRow.estimate?.lower).toBeLessThan(0.5);
    expect(asaRow.estimate?.upper).toBeGreaterThan(0.5);
  });

  it('returns a null estimate rather than zero for an empty group', () => {
    // Zero would read as "nobody in this group dies", which is a claim. Null
    // is the absence of one.
    const profile = riskProfile([makeCase({ asa: 1 })], []);
    const asaRow = profile.rows.find((r) => r.key === 'highAsa')!;

    expect(asaRow.estimate).toBeNull();
  });

  it('counts the combination cohort as patients having every selected factor', () => {
    const both = makeCase({ asa: 4, isEmergency: true, diedInHospital: true });
    const onlyOne = makeCase({ asa: 4, isEmergency: false, diedInHospital: false });

    const profile = riskProfile([both, onlyOne], ['highAsa', 'emergency']);

    expect(profile.combination?.observed?.total).toBe(1);
    expect(profile.combination?.observed?.estimate).toBe(1);
  });
});

describe('riskProfile against the published VitalDB table', () => {
  const csv = readFileSync(resolve(process.cwd(), 'public/cases.csv'), 'utf8');
  const { cases } = parseCases(csv);

  it('shows that the additive model understates the combined risk', () => {
    // The finding this panel exists to correct. The original summed each
    // factor's marginal difference onto a baseline; the patients who actually
    // carry all four die at a materially higher rate than that sum predicts.
    const profile = riskProfile(cases, ['highAsa', 'emergency', 'lowAlbumin', 'olderThan65']);

    const additive = profile.combination!.additivePrediction!;
    const observed = profile.combination!.observed!;

    expect(observed.total).toBeGreaterThan(0);
    expect(observed.estimate).toBeGreaterThan(additive);
    // Not a rounding discrepancy: the gap is several percentage points.
    expect(observed.estimate - additive).toBeGreaterThan(0.03);
  });

  it('leaves the combined cohort too small to state precisely', () => {
    // Roughly fifty patients carry all four factors. Whatever the point
    // estimate, the interval spanning it is very wide — which is the honest
    // reading, and the one the original's single confident number hid.
    const profile = riskProfile(cases, ['highAsa', 'emergency', 'lowAlbumin', 'olderThan65']);
    const observed = profile.combination!.observed!;

    expect(observed.total).toBeLessThan(200);
    expect(observed.upper - observed.lower).toBeGreaterThan(0.1);
  });

  it('puts baseline mortality well below one percent', () => {
    const baseline = riskProfile(cases, []).rows.find((r) => r.key === 'baseline')!.estimate!;

    expect(baseline.estimate).toBeLessThan(0.01);
    expect(baseline.total).toBeGreaterThan(1000);
  });

  it('finds every factor associated with higher mortality than baseline', () => {
    const profile = riskProfile(cases, []);
    const baseline = profile.rows.find((r) => r.key === 'baseline')!.estimate!;

    for (const row of profile.rows.filter((r) => r.key !== 'baseline')) {
      expect(row.estimate!.estimate).toBeGreaterThan(baseline.estimate);
    }
  });
});
