import { describe, it, expect } from 'vitest';
import { makeCase } from '@/test/factories';
import { ageExtent, facetCounts } from './facets';

describe('facetCounts', () => {
  it('counts distinct values', () => {
    const cases = [
      makeCase({ department: 'Urology' }),
      makeCase({ department: 'Urology' }),
      makeCase({ department: 'Gynecology' }),
    ];

    expect(facetCounts(cases, 'department')).toEqual([
      { value: 'Urology', count: 2 },
      { value: 'Gynecology', count: 1 },
    ]);
  });

  it('orders by frequency, not alphabetically', () => {
    // The real distribution is extremely skewed, so alphabetical order would
    // bury the departments that hold almost all the cases.
    const cases = [
      makeCase({ department: 'Zebra surgery' }),
      makeCase({ department: 'Zebra surgery' }),
      makeCase({ department: 'Aardvark surgery' }),
    ];

    expect(facetCounts(cases, 'department').map((f) => f.value)).toEqual([
      'Zebra surgery',
      'Aardvark surgery',
    ]);
  });

  it('breaks ties alphabetically so the order is stable across reloads', () => {
    const cases = [makeCase({ department: 'Urology' }), makeCase({ department: 'Gynecology' })];

    expect(facetCounts(cases, 'department').map((f) => f.value)).toEqual(['Gynecology', 'Urology']);
  });

  it('omits cases with no recorded value', () => {
    const cases = [makeCase({ department: 'Urology' }), makeCase({ department: null })];

    expect(facetCounts(cases, 'department')).toEqual([{ value: 'Urology', count: 1 }]);
  });

  it('returns nothing for an empty cohort', () => {
    expect(facetCounts([], 'department')).toEqual([]);
  });
});

describe('ageExtent', () => {
  it('spans the recorded ages', () => {
    const cases = [makeCase({ age: 40 }), makeCase({ age: 12 }), makeCase({ age: 88 })];
    expect(ageExtent(cases)).toEqual([12, 88]);
  });

  it('ignores cases with no recorded age', () => {
    const cases = [makeCase({ age: null }), makeCase({ age: 50 })];
    expect(ageExtent(cases)).toEqual([50, 50]);
  });

  it('returns null when nothing has an age', () => {
    // Distinct from [0, 0], which a slider would render as a valid empty range.
    expect(ageExtent([makeCase({ age: null })])).toBeNull();
    expect(ageExtent([])).toBeNull();
  });

  it('keeps fractional ages, which the real data contains', () => {
    // The youngest recorded patient is 0.3 years old. Rounding to integers
    // would drop paediatric cases to age 0.
    expect(ageExtent([makeCase({ age: 0.3 }), makeCase({ age: 94 })])).toEqual([0.3, 94]);
  });
});
