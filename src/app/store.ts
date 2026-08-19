import { configureStore } from '@reduxjs/toolkit';
import { casesApi } from '@/data/casesApi';
import { trackIndexApi } from '@/data/trackIndexApi';
import { filtersReducer } from '@/features/filters/filtersSlice';
import { telemetryReducer } from '@/features/telemetry/telemetrySlice';

/**
 * The control plane.
 *
 * This store holds what the operator has asked for — filters, and later the
 * selected case and playback state — plus the static case table as cached
 * reference data. It will never hold telemetry samples. At 500 Hz a dispatch
 * per sample is 500 actions a second, each waking every connected component,
 * against a store that cannot be garbage collected. Sample data lives in a ring
 * buffer outside React instead.
 */
/**
 * Built by a factory so each test gets an isolated instance. Sharing the
 * singleton would carry one test's RTK Query cache and filter state into the
 * next, which makes failures depend on execution order.
 */
export const makeStore = () =>
  configureStore({
    reducer: {
      filters: filtersReducer,
      telemetry: telemetryReducer,
      [casesApi.reducerPath]: casesApi.reducer,
      [trackIndexApi.reducerPath]: trackIndexApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault({
        // The dev-only serialisability and immutability checks walk the entire
        // state tree on every action. With 6,388 cases of 23 fields each that is
        // ~147,000 values per dispatch, which makes filtering visibly laggy in
        // development while behaving fine in production. The cached case payload
        // is plain parsed data and provably serialisable, so it is exempted
        // rather than the checks being switched off wholesale.
        serializableCheck: { ignoredPaths: [`${casesApi.reducerPath}.queries`] },
        immutableCheck: { ignoredPaths: [`${casesApi.reducerPath}.queries`] },
      }).concat(casesApi.middleware, trackIndexApi.middleware),
  });

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
