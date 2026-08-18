import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Sex } from '@/data/schema';
import { NO_FILTERS, type CaseFilters } from '@/transforms/filterCases';

/**
 * The filter slice holds the cohort selection and nothing derived from it.
 *
 * No filtered array is ever stored here. Storing derived data means two
 * representations of one fact that can disagree, which is precisely how the
 * original ended up with an age brush that cancelled itself when a department
 * was chosen. Derived cohorts come from memoised selectors instead.
 */
const filtersSlice = createSlice({
  name: 'filters',
  initialState: NO_FILTERS,
  reducers: {
    /**
     * Selecting the already-selected department clears it. Bars are the only
     * affordance for this filter, so without toggle-to-clear there would be no
     * way to undo a click except a separate reset control.
     */
    departmentToggled(state, action: PayloadAction<string>) {
      state.department = state.department === action.payload ? null : action.payload;
    },

    /** null clears the range, which is what a dismissed brush reports. */
    ageRangeSelected(state, action: PayloadAction<[number, number] | null>) {
      state.ageRange = action.payload;
    },

    sexSelected(state, action: PayloadAction<Sex | null>) {
      state.sex = action.payload;
    },

    operationTypeSelected(state, action: PayloadAction<string | null>) {
      state.operationType = action.payload;
    },

    emergencyOnlySet(state, action: PayloadAction<boolean>) {
      state.emergencyOnly = action.payload;
    },

    allFiltersCleared() {
      // Returning a fresh value rather than mutating keeps this correct if a
      // field is added to CaseFilters later.
      return { ...NO_FILTERS };
    },

    /** Used when hydrating from the URL, where every field arrives at once. */
    filtersReplaced(_state, action: PayloadAction<CaseFilters>) {
      return action.payload;
    },
  },
});

export const {
  departmentToggled,
  ageRangeSelected,
  sexSelected,
  operationTypeSelected,
  emergencyOnlySet,
  allFiltersCleared,
  filtersReplaced,
} = filtersSlice.actions;

export const filtersReducer = filtersSlice.reducer;
