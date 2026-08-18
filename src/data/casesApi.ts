import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import type { SurgeryCase } from './schema';
import type { ParseReport } from './parseCases';
import { fetchCases } from './loadCases';

export interface CasesPayload {
  /** readonly: the cache is shared, and a consumer must not sort it in place. */
  cases: readonly SurgeryCase[];
  report: ParseReport;
}

/**
 * The case table, fetched once.
 *
 * RTK Query rather than a thunk, because Phase D adds a per-case telemetry
 * track index — many endpoints keyed by caseId, where the caching, request
 * de-duplication and generated loading/error states genuinely pay for
 * themselves. Using it here too keeps one data-fetching idiom instead of two.
 *
 * fakeBaseQuery because this endpoint is not a JSON REST call: it fetches text
 * and runs it through the CSV parse boundary. queryFn lets that live behind the
 * same hook interface as everything else.
 *
 * Holding 6,388 parsed cases in the store is fine — it is static reference data
 * written once and never mutated. This is not a contradiction of the rule that
 * telemetry stays out of Redux: the objection there is to unbounded,
 * high-frequency writes, not to size.
 */
export const casesApi = createApi({
  reducerPath: 'casesApi',
  baseQuery: fakeBaseQuery<string>(),
  endpoints: (build) => ({
    // `void` is RTK Query's documented argument type for an endpoint that takes
    // none. `undefined` would force every caller to pass an explicit argument.
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    getCases: build.query<CasesPayload, void>({
      queryFn: async (_arg, api) => {
        try {
          // api.signal aborts on unmount or supersession, so an in-flight 2.1 MB
          // download is dropped rather than parsed for nobody.
          const { cases, report } = await fetchCases(api.signal);
          return { data: { cases, report } };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Unknown failure' };
        }
      },
      // The published dataset is static, so there is nothing to revalidate.
      keepUnusedDataFor: Infinity,
    }),
  }),
});

export const { useGetCasesQuery } = casesApi;
