import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCases } from './parseCases';

const HEADER =
  'caseid,subjectid,age,sex,height,weight,bmi,asa,emop,department,optype,ane_type,' +
  'casestart,caseend,anestart,aneend,opstart,opend,icu_days,death_inhosp,intraop_ebl,' +
  'preop_alb,preop_hb';

/** Builds a one-row CSV from a partial map of column -> raw cell text. */
function csvWith(cells: Record<string, string>): string {
  const columns = HEADER.split(',');
  const row = columns.map((c) => cells[c] ?? '').join(',');
  return `${HEADER}\n${row}`;
}

/** Written as an escape: the literal character is invisible in a diff. */
const BOM = '\uFEFF';

describe('parseCases', () => {
  it('reads an empty cell as null rather than 0 or empty string', () => {
    // The original coerced '' to '', leaving strings in numeric fields. A 0
    // would be worse still: it would read as "no ICU stay" or "no blood loss"
    // and pull every cohort average down.
    const { cases } = parseCases(csvWith({ caseid: '1' }));
    const c = cases[0]!;

    expect(c.age).toBeNull();
    expect(c.icuDays).toBeNull();
    expect(c.preopAlbuminGdl).toBeNull();
    expect(c.department).toBeNull();
    expect(c.diedInHospital).toBeNull();
  });

  it('strips the UTF-8 BOM so the first column is addressable', () => {
    // Left in place, the BOM becomes part of the header name and every row
    // loses its primary key.
    const { cases, report } = parseCases(BOM + csvWith({ caseid: '42' }));

    expect(report.rowsSkipped).toBe(0);
    expect(cases[0]!.caseId).toBe(42);
  });

  it('handles CRLF line endings', () => {
    const csv = `${HEADER}\r\n7,,,,,,,,,,,,,,,,,,,,,,\r\n`;
    const { cases } = parseCases(csv);

    expect(cases).toHaveLength(1);
    expect(cases[0]!.caseId).toBe(7);
  });

  it('keeps columns aligned when a quoted field contains a comma', () => {
    // 15% of real rows have one of these. Splitting on commas shifts every
    // later column, which silently corrupts outcomes rather than erroring.
    const csv = 'caseid,dx,ane_type\n5,"Abnormal chest CT, lung nodule",General';
    const { cases } = parseCases(csv);

    expect(cases[0]!.anesthesiaType).toBe('General');
  });

  it('maps 0/1 columns to booleans', () => {
    const { cases } = parseCases(csvWith({ caseid: '1', emop: '1', death_inhosp: '0' }));

    expect(cases[0]!.isEmergency).toBe(true);
    expect(cases[0]!.diedInHospital).toBe(false);
  });

  it('treats an out-of-domain flag as unrecorded, not false', () => {
    const { cases } = parseCases(csvWith({ caseid: '1', emop: '7' }));
    expect(cases[0]!.isEmergency).toBeNull();
  });

  it('rejects non-numeric text in a numeric column instead of yielding NaN', () => {
    // NaN survives arithmetic and scales silently, surfacing as a blank chart
    // a long way from its cause.
    const { cases } = parseCases(csvWith({ caseid: '1', age: 'unknown', bmi: 'n/a' }));

    expect(cases[0]!.age).toBeNull();
    expect(cases[0]!.bmi).toBeNull();
  });

  it('accepts only M or F for sex', () => {
    expect(parseCases(csvWith({ caseid: '1', sex: 'f' })).cases[0]!.sex).toBe('F');
    expect(parseCases(csvWith({ caseid: '1', sex: 'X' })).cases[0]!.sex).toBeNull();
  });

  it('accepts ASA only within its ordinal 1-6 range', () => {
    expect(parseCases(csvWith({ caseid: '1', asa: '3' })).cases[0]!.asa).toBe(3);
    expect(parseCases(csvWith({ caseid: '1', asa: '0' })).cases[0]!.asa).toBeNull();
    expect(parseCases(csvWith({ caseid: '1', asa: '9' })).cases[0]!.asa).toBeNull();
    expect(parseCases(csvWith({ caseid: '1', asa: '2.5' })).cases[0]!.asa).toBeNull();
  });

  it('skips rows without a case id and reports the count', () => {
    const csv = `${HEADER}\n1,,,,,,,,,,,,,,,,,,,,,,\n,,,,,,,,,,,,,,,,,,,,,,`;
    const { cases, report } = parseCases(csv);

    expect(cases).toHaveLength(1);
    expect(report).toEqual({ rowsRead: 2, casesParsed: 1, rowsSkipped: 1 });
  });
});

describe('parseCases against the published VitalDB table', () => {
  // Guards the parser against the real file rather than a fixture. If the
  // published dataset is ever replaced, these fail loudly instead of quietly
  // changing every statistic in the dashboard.
  // Vite rewrites import.meta.url, so it is not a file:// URL under Vitest.
  // Vitest sets cwd to the project root, which is stable enough to resolve from.
  const csv = readFileSync(resolve(process.cwd(), 'public/cases.csv'), 'utf8');
  const { cases, report } = parseCases(csv);

  it('parses every row', () => {
    expect(report).toEqual({ rowsRead: 6388, casesParsed: 6388, rowsSkipped: 0 });
  });

  it('reproduces the department distribution', () => {
    const counts = new Map<string, number>();
    for (const c of cases) {
      const key = c.department ?? '(none)';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(Object.fromEntries(counts)).toEqual({
      'General surgery': 4930,
      'Thoracic surgery': 1111,
      Gynecology: 230,
      Urology: 117,
    });
  });

  it('preserves column alignment on rows with embedded commas', () => {
    // Case 13's diagnosis is "Abnormal chest CT, lung nodule". Everything after
    // it on that row shifts if the quoting is mishandled.
    const case13 = cases.find((c) => c.caseId === 13)!;

    expect(case13.department).toBe('Thoracic surgery');
    expect(case13.operationType).toBe('Minor resection');
    expect(case13.anesthesiaType).toBe('General');
  });

  it('counts in-hospital deaths', () => {
    expect(cases.filter((c) => c.diedInHospital === true)).toHaveLength(57);
  });

  it('preserves missingness rather than filling it', () => {
    expect(cases.filter((c) => c.preopAlbuminGdl === null)).toHaveLength(372);
    expect(cases.filter((c) => c.intraopBloodLossMl === null)).toHaveLength(2401);
    expect(cases.filter((c) => c.asa === null)).toHaveLength(133);
  });

  it('spans the full recorded age range, infants included', () => {
    const ages = cases.map((c) => c.age).filter((a): a is number => a !== null);

    expect(ages).toHaveLength(6388);
    expect(Math.min(...ages)).toBe(0.3);
    expect(Math.max(...ages)).toBe(94);
    // The original's copy claimed these cases "span six decades". They span
    // nine, and include infants - who are then matched on BMI and ASA.
  });
});
