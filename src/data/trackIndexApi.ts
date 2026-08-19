import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { parseTrackIndex, type TrackIndex } from '@/telemetry/trackIndex';

const TRACK_INDEX_URL = `${import.meta.env.BASE_URL}track-index.json`;

/**
 * The build-time derived track index.
 *
 * Separate from casesApi rather than another endpoint on it, because they fail
 * independently: the dashboard is fully usable with no telemetry, and a missing
 * index should disable one panel rather than take down the page. Keeping them
 * apart means the error states cannot get crossed.
 */
export const trackIndexApi = createApi({
  reducerPath: 'trackIndexApi',
  baseQuery: fakeBaseQuery<string>(),
  endpoints: (build) => ({
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    getTrackIndex: build.query<TrackIndex, void>({
      queryFn: async (_arg, api) => {
        try {
          const response = await fetch(TRACK_INDEX_URL, { signal: api.signal });
          if (!response.ok) {
            throw new Error(`Could not load the track index: HTTP ${String(response.status)}`);
          }
          // parseTrackIndex validates rather than trusts: a 404 page still
          // parses as JSON, and an undefined track id would otherwise surface
          // as a silent no-op inside the replay source.
          return { data: parseTrackIndex(await response.json()) };
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Track index unavailable' };
        }
      },
      keepUnusedDataFor: Infinity,
    }),
  }),
});

export const { useGetTrackIndexQuery } = trackIndexApi;
