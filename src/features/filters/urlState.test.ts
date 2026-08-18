import { describe, it, expect } from 'vitest';
import { NO_FILTERS, type CaseFilters } from '@/transforms/filterCases';
import { decodeFilters, encodeFilters } from './urlState';

describe('encodeFilters', () => {
  it('produces an empty query string when nothing is selected', () => {
    // An unfiltered dashboard should sit at a bare URL, so the presence of a
    // query string means something was actually chosen.
    expect(encodeFilters(NO_FILTERS)).toBe('');
  });

  it('omits emergencyOnly when it is false', () => {
    expect(encodeFilters({ ...NO_FILTERS, emergencyOnly: false })).toBe('');
    expect(encodeFilters({ ...NO_FILTERS, emergencyOnly: true })).toBe('emg=1');
  });

  it('encodes an age range as a hyphenated pair', () => {
    expect(encodeFilters({ ...NO_FILTERS, ageRange: [40, 60] })).toBe('age=40-60');
  });

  it('escapes values containing spaces', () => {
    const encoded = encodeFilters({ ...NO_FILTERS, department: 'Thoracic surgery' });
    expect(decodeFilters(encoded).department).toBe('Thoracic surgery');
  });
});

describe('decodeFilters', () => {
  it('returns defaults for an empty query string', () => {
    expect(decodeFilters('')).toEqual(NO_FILTERS);
  });

  it('round-trips a full selection', () => {
    const filters: CaseFilters = {
      department: 'Thoracic surgery',
      ageRange: [18, 65],
      sex: 'M',
      operationType: 'Minor resection',
      emergencyOnly: true,
    };

    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });

  it('rejects a sex it does not recognise', () => {
    // A URL is user-editable input from outside the app. An unrecognised value
    // must widen the cohort, never produce a filter no control can clear.
    expect(decodeFilters('sex=Z').sex).toBeNull();
    expect(decodeFilters('sex=').sex).toBeNull();
  });

  it('rejects a malformed age range instead of yielding NaN', () => {
    expect(decodeFilters('age=abc').ageRange).toBeNull();
    expect(decodeFilters('age=40').ageRange).toBeNull();
    expect(decodeFilters('age=40-60-80').ageRange).toBeNull();
    expect(decodeFilters('age=-').ageRange).toBeNull();
  });

  it('repairs a reversed age range rather than discarding it', () => {
    // The intent is unambiguous, so a hand-edited link keeps working.
    expect(decodeFilters('age=60-40').ageRange).toEqual([40, 60]);
  });

  it('treats any emergency value other than 1 as off', () => {
    expect(decodeFilters('emg=1').emergencyOnly).toBe(true);
    expect(decodeFilters('emg=true').emergencyOnly).toBe(false);
    expect(decodeFilters('emg=0').emergencyOnly).toBe(false);
  });

  it('ignores parameters it does not know about', () => {
    // Forward compatibility: an old build opening a newer link should still work.
    expect(decodeFilters('dept=Urology&somethingNew=42')).toEqual({
      ...NO_FILTERS,
      department: 'Urology',
    });
  });

  it('accepts URLSearchParams as well as a string', () => {
    expect(decodeFilters(new URLSearchParams('dept=Urology')).department).toBe('Urology');
  });
});
