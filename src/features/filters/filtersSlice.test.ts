import { describe, it, expect } from 'vitest';
import { NO_FILTERS } from '@/transforms/filterCases';
import {
  ageRangeSelected,
  allFiltersCleared,
  departmentToggled,
  emergencyOnlySet,
  filtersReducer,
  filtersReplaced,
  sexSelected,
} from './filtersSlice';

describe('filtersReducer', () => {
  it('starts with nothing filtered', () => {
    expect(filtersReducer(undefined, { type: '@@INIT' })).toEqual(NO_FILTERS);
  });

  it('selects a department', () => {
    const next = filtersReducer(NO_FILTERS, departmentToggled('Urology'));
    expect(next.department).toBe('Urology');
  });

  it('clears the department when the same one is selected again', () => {
    // Bars are the only affordance for this filter, so toggle-to-clear is the
    // only way to undo a click without a separate reset control.
    const selected = filtersReducer(NO_FILTERS, departmentToggled('Urology'));
    const cleared = filtersReducer(selected, departmentToggled('Urology'));

    expect(cleared.department).toBeNull();
  });

  it('switches directly between departments', () => {
    const first = filtersReducer(NO_FILTERS, departmentToggled('Urology'));
    const second = filtersReducer(first, departmentToggled('Gynecology'));

    expect(second.department).toBe('Gynecology');
  });

  it('clears the age range when the brush reports null', () => {
    const brushed = filtersReducer(NO_FILTERS, ageRangeSelected([40, 60]));
    expect(brushed.ageRange).toEqual([40, 60]);

    const dismissed = filtersReducer(brushed, ageRangeSelected(null));
    expect(dismissed.ageRange).toBeNull();
  });

  it('leaves other filters untouched when one changes', () => {
    // Guards against the original's habit of recomputing one shared filtered
    // array, where changing any dimension disturbed the others.
    const state = [
      departmentToggled('Urology'),
      ageRangeSelected([40, 60]),
      sexSelected('F'),
    ].reduce(filtersReducer, NO_FILTERS);

    const next = filtersReducer(state, emergencyOnlySet(true));

    expect(next).toEqual({
      department: 'Urology',
      ageRange: [40, 60],
      sex: 'F',
      operationType: null,
      emergencyOnly: true,
    });
  });

  it('resets every dimension at once', () => {
    const state = [departmentToggled('Urology'), sexSelected('M'), emergencyOnlySet(true)].reduce(
      filtersReducer,
      NO_FILTERS,
    );

    expect(filtersReducer(state, allFiltersCleared())).toEqual(NO_FILTERS);
  });

  it('replaces the whole selection when hydrating from a URL', () => {
    const fromUrl = {
      department: 'Thoracic surgery',
      ageRange: [18, 65] as [number, number],
      sex: 'M' as const,
      operationType: 'Minor resection',
      emergencyOnly: true,
    };

    expect(filtersReducer(NO_FILTERS, filtersReplaced(fromUrl))).toEqual(fromUrl);
  });

  it('does not mutate the previous state', () => {
    const before = { ...NO_FILTERS };
    filtersReducer(before, departmentToggled('Urology'));
    expect(before).toEqual(NO_FILTERS);
  });
});
