import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeCase } from '@/test/factories';
import { parseCases } from '@/data/parseCases';
import { PHASES, phaseByOperationType, phaseDuration, summariseDurations } from './phases';

const preIncision = PHASES.find((p) => p.key === 'preIncision')!;

describe('phaseDuration', () => {
  it('returns minutes between the two timestamps', () => {
    const c = makeCase({ anesthesiaStartSec: -600, operationStartSec: 1800 });
    expect(phaseDuration(c, preIncision)).toBe(40);
  });

  it('works from a negative origin, since only the difference is meaningful', () => {
    // Timestamps are seconds from a per-case origin that is not itself zero;
    // anaesthesia routinely starts before it.
    const c = makeCase({ anesthesiaStartSec: -552, operationStartSec: 1668 });
    expect(phaseDuration(c, preIncision)).toBeCloseTo(37, 0);
  });

  it('returns null when either end is unrecorded', () => {
    expect(phaseDuration(makeCase({ anesthesiaStartSec: 0 }), preIncision)).toBeNull();
    expect(phaseDuration(makeCase({ operationStartSec: 0 }), preIncision)).toBeNull();
  });

  it('drops a negative interval rather than clamping it', () => {
    // Clamping would pile record errors onto zero and create a fake spike.
    const reversed = makeCase({ anesthesiaStartSec: 1800, operationStartSec: 0 });
    expect(phaseDuration(reversed, preIncision)).toBeNull();
  });

  it('drops an implausibly long interval', () => {
    const bad = makeCase({ anesthesiaStartSec: 0, operationStartSec: 60 * 60 * 48 });
    expect(phaseDuration(bad, preIncision)).toBeNull();
  });
});

describe('summariseDurations', () => {
  it('reports median and quartiles', () => {
    const summary = summariseDurations([10, 20, 30, 40, 50])!;

    expect(summary.count).toBe(5);
    expect(summary.median).toBe(30);
    expect(summary.q1).toBe(20);
    expect(summary.q3).toBe(40);
  });

  it('does not mutate its input', () => {
    const values = [30, 10, 20];
    summariseDurations(values);
    expect(values).toEqual([30, 10, 20]);
  });

  it('returns null for nothing to summarise', () => {
    expect(summariseDurations([])).toBeNull();
  });
});

describe('phaseByOperationType', () => {
  it('always leads with an all-cases row', () => {
    const rows = phaseByOperationType([], preIncision);
    expect(rows[0]?.key).toBe('__all__');
  });

  it('drops types with too few cases to support quartiles', () => {
    const cases = [
      ...Array.from({ length: 25 }, () =>
        makeCase({ operationType: 'Colorectal', anesthesiaStartSec: 0, operationStartSec: 2400 }),
      ),
      makeCase({ operationType: 'Rare', anesthesiaStartSec: 0, operationStartSec: 2400 }),
    ];

    const rows = phaseByOperationType(cases, preIncision);

    expect(rows.map((r) => r.key)).toContain('Colorectal');
    expect(rows.map((r) => r.key)).not.toContain('Rare');
  });

  it('orders by case count so rows hold position under filtering', () => {
    const cases = [
      ...Array.from({ length: 30 }, () =>
        makeCase({ operationType: 'Common', anesthesiaStartSec: 0, operationStartSec: 6000 }),
      ),
      ...Array.from({ length: 21 }, () =>
        makeCase({ operationType: 'Less common', anesthesiaStartSec: 0, operationStartSec: 600 }),
      ),
    ];

    expect(phaseByOperationType(cases, preIncision).map((r) => r.key)).toEqual([
      '__all__',
      'Common',
      'Less common',
    ]);
  });
});

describe('phases against the published VitalDB table', () => {
  const csv = readFileSync(resolve(process.cwd(), 'public/cases.csv'), 'utf8');
  const { cases } = parseCases(csv);

  it('puts the typical case about 48 minutes from anaesthesia to incision', () => {
    const rows = phaseByOperationType(cases, preIncision, 20);
    const all = rows[0]!.summary!;

    expect(all.count).toBeGreaterThan(6000);
    expect(all.median).toBeCloseTo(48, 0);
  });

  it("confirms the original's breast versus transplant timing claim", () => {
    // Worth stating plainly: this claim was correct. The original said breast
    // surgery averages 34 minutes to incision and transplantation about 70,
    // and both hold — 33.9 and 69.7 by mean. Medians are lower (30.5 and 68),
    // which is why this panel reports medians.
    const rows = phaseByOperationType(cases, preIncision, 20);
    const breast = rows.find((r) => r.key === 'Breast')!.summary!;
    const transplant = rows.find((r) => r.key === 'Transplantation')!.summary!;

    expect(breast.median).toBeCloseTo(30.5, 1);
    expect(transplant.median).toBeCloseTo(68, 0);
    expect(transplant.median).toBeGreaterThan(breast.median * 2);
  });

  it('finds the operation itself longer and more variable than the run-up', () => {
    const operation = PHASES.find((p) => p.key === 'operation')!;
    const preRows = phaseByOperationType(cases, preIncision, 1);
    const opRows = phaseByOperationType(cases, operation, 1);

    const pre = preRows[0]!.summary!;
    const op = opRows[0]!.summary!;

    expect(op.median).toBeGreaterThan(pre.median);
    expect(op.q3 - op.q1).toBeGreaterThan(pre.q3 - pre.q1);
  });
});
