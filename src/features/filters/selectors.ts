import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/app/store';
import { countActiveFilters } from '@/transforms/filterCases';

export const selectFilters = (state: RootState) => state.filters;

/**
 * Memoised so the header badge does not re-render on every unrelated dispatch.
 * The count is cheap, but the pattern is the point: derived values are computed
 * here, never stored in the slice.
 */
export const selectActiveFilterCount = createSelector([selectFilters], countActiveFilters);

export const selectHasActiveFilters = createSelector(
  [selectActiveFilterCount],
  (count) => count > 0,
);
