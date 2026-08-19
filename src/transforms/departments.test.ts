import { describe, it, expect } from 'vitest';
import { makeCase } from '@/test/factories';
import { departmentBars, departmentShares, maxDepartmentTotal } from './departments';

const ALL = [
  makeCase({ department: 'General surgery' }),
  makeCase({ department: 'General surgery' }),
  makeCase({ department: 'General surgery' }),
  makeCase({ department: 'Urology' }),
  makeCase({ department: null }),
];

describe('departmentBars', () => {
  it('reports the cohort against the whole for each department', () => {
    const matched = ALL.filter((c) => c.department === 'Urology');

    expect(departmentBars(ALL, matched)).toEqual([
      { department: 'General surgery', total: 3, matched: 0 },
      { department: 'Urology', total: 1, matched: 1 },
    ]);
  });

  it('keeps a department visible when the filter excludes it', () => {
    // The original drew only the filtered data, so an excluded department
    // vanished — you could not see that the filter had removed it.
    const bars = departmentBars(ALL, []);

    expect(bars.map((b) => b.department)).toEqual(['General surgery', 'Urology']);
    expect(bars.every((b) => b.matched === 0)).toBe(true);
  });

  it('orders by total so rows do not move under filtering', () => {
    // Ordering by matched count would make bars jump between rows as filters
    // change, turning every click into a moving target.
    const matched = ALL.filter((c) => c.department === 'Urology');
    const bars = departmentBars(ALL, matched);

    expect(bars[0]?.department).toBe('General surgery');
  });

  it('breaks ties alphabetically for a stable order', () => {
    const cases = [makeCase({ department: 'Urology' }), makeCase({ department: 'Gynecology' })];

    expect(departmentBars(cases, cases).map((b) => b.department)).toEqual([
      'Gynecology',
      'Urology',
    ]);
  });

  it('omits cases with no recorded department', () => {
    expect(departmentBars(ALL, ALL)).toHaveLength(2);
  });

  it('handles an empty table', () => {
    expect(departmentBars([], [])).toEqual([]);
  });
});

describe('maxDepartmentTotal', () => {
  it('returns the longest bar', () => {
    expect(maxDepartmentTotal(departmentBars(ALL, ALL))).toBe(3);
  });

  it('returns zero for no departments', () => {
    expect(maxDepartmentTotal([])).toBe(0);
  });
});

describe('departmentShares', () => {
  it('reports each department as a percentage of the whole', () => {
    const shares = departmentShares(departmentBars(ALL, ALL));

    expect(shares[0]?.share).toBeCloseTo(75);
    expect(shares[1]?.share).toBeCloseTo(25);
  });

  it('returns nothing rather than dividing by zero', () => {
    expect(departmentShares([])).toEqual([]);
  });
});
