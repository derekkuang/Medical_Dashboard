import { describe, it, expect } from 'vitest';
import { makeCase } from '@/test/factories';
import { NO_FILTERS, countActiveFilters, filterCases, matchesFilters } from './filterCases';

describe('matchesFilters', () => {
  it('accepts everything when no filter is set', () => {
    expect(matchesFilters(makeCase(), NO_FILTERS)).toBe(true);
  });

  it('matches on department', () => {
    const c = makeCase({ department: 'Thoracic surgery' });

    expect(matchesFilters(c, { ...NO_FILTERS, department: 'Thoracic surgery' })).toBe(true);
    expect(matchesFilters(c, { ...NO_FILTERS, department: 'Urology' })).toBe(false);
  });

  it('matches on operation type', () => {
    const c = makeCase({ operationType: 'Minor resection' });

    expect(matchesFilters(c, { ...NO_FILTERS, operationType: 'Minor resection' })).toBe(true);
    expect(matchesFilters(c, { ...NO_FILTERS, operationType: 'Colorectal' })).toBe(false);
    expect(
      matchesFilters(makeCase({ operationType: null }), {
        ...NO_FILTERS,
        operationType: 'Colorectal',
      }),
    ).toBe(false);
  });

  it('treats an unrecorded value as failing an active filter', () => {
    // A filter is a positive assertion. Including rows whose sex was never
    // recorded would pad the cohort with cases that cannot support any claim
    // being made about it.
    const unknown = makeCase({ sex: null });

    expect(matchesFilters(unknown, { ...NO_FILTERS, sex: 'F' })).toBe(false);
    expect(matchesFilters(unknown, NO_FILTERS)).toBe(true);
  });

  it('treats the age range as inclusive at both ends', () => {
    const filters = { ...NO_FILTERS, ageRange: [40, 60] as [number, number] };

    expect(matchesFilters(makeCase({ age: 40 }), filters)).toBe(true);
    expect(matchesFilters(makeCase({ age: 60 }), filters)).toBe(true);
    expect(matchesFilters(makeCase({ age: 39.9 }), filters)).toBe(false);
    expect(matchesFilters(makeCase({ age: 60.1 }), filters)).toBe(false);
  });

  it('excludes cases with no recorded age when an age range is active', () => {
    const filters = { ...NO_FILTERS, ageRange: [0, 120] as [number, number] };
    expect(matchesFilters(makeCase({ age: null }), filters)).toBe(false);
  });

  it('distinguishes elective from unrecorded when filtering to emergencies', () => {
    // isEmergency is boolean | null: false means elective, null means the field
    // was never recorded. Neither belongs in an emergency cohort.
    const filters = { ...NO_FILTERS, emergencyOnly: true };

    expect(matchesFilters(makeCase({ isEmergency: true }), filters)).toBe(true);
    expect(matchesFilters(makeCase({ isEmergency: false }), filters)).toBe(false);
    expect(matchesFilters(makeCase({ isEmergency: null }), filters)).toBe(false);
  });

  it('requires every active filter to pass, not any', () => {
    const c = makeCase({ department: 'Urology', sex: 'M', age: 50 });

    expect(matchesFilters(c, { ...NO_FILTERS, department: 'Urology', sex: 'M' })).toBe(true);
    expect(matchesFilters(c, { ...NO_FILTERS, department: 'Urology', sex: 'F' })).toBe(false);
  });
});

describe('filterCases', () => {
  const cases = [
    makeCase({ department: 'Urology', age: 30, sex: 'M' }),
    makeCase({ department: 'Urology', age: 70, sex: 'F' }),
    makeCase({ department: 'Gynecology', age: 45, sex: 'F' }),
  ];

  it('returns every case when nothing is filtered', () => {
    expect(filterCases(cases, NO_FILTERS)).toHaveLength(3);
  });

  it('composes independent filters', () => {
    const result = filterCases(cases, {
      ...NO_FILTERS,
      department: 'Urology',
      ageRange: [60, 80],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.sex).toBe('F');
  });

  it('can return an empty cohort', () => {
    // The UI must render an empty state for this rather than a broken chart,
    // so an empty result is a supported outcome and not an error.
    expect(filterCases(cases, { ...NO_FILTERS, department: 'Cardiac surgery' })).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before = [...cases];
    filterCases(cases, { ...NO_FILTERS, department: 'Urology' });
    expect(cases).toEqual(before);
  });
});

describe('countActiveFilters', () => {
  it('counts nothing when cleared', () => {
    expect(countActiveFilters(NO_FILTERS)).toBe(0);
  });

  it('does not count emergencyOnly when it is false', () => {
    // false is the neutral state for this filter, not an active selection.
    expect(countActiveFilters({ ...NO_FILTERS, emergencyOnly: false })).toBe(0);
    expect(countActiveFilters({ ...NO_FILTERS, emergencyOnly: true })).toBe(1);
  });

  it('counts each active dimension once', () => {
    expect(
      countActiveFilters({
        department: 'Urology',
        ageRange: [1, 2],
        sex: 'M',
        operationType: 'Colorectal',
        emergencyOnly: true,
      }),
    ).toBe(5);
  });
});
