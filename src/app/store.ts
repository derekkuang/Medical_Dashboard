import { configureStore } from '@reduxjs/toolkit';
import { filtersReducer } from '@/features/filters/filtersSlice';

/**
 * The control plane.
 *
 * This store holds what the operator has asked for — filters, and later the
 * selected case and playback state. It will never hold telemetry samples. At
 * 500 Hz a dispatch per sample is 500 actions a second, each waking every
 * connected component, and the store becomes an unbounded array that cannot be
 * garbage collected. Sample data lives in a ring buffer outside React instead.
 */
export const store = configureStore({
  reducer: {
    filters: filtersReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
