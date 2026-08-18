import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { filtersReplaced } from '@/features/filters/filtersSlice';
import { selectFilters } from '@/features/filters/selectors';
import { decodeFilters, encodeFilters } from '@/features/filters/urlState';

/**
 * Keeps the filter selection in the address bar, so a filtered view is a
 * shareable link.
 *
 * The store is the single source of truth; the URL is a projection of it. Data
 * flows URL -> store exactly once (on mount, and on back/forward), and
 * store -> URL on every change thereafter. Treating both as authoritative is
 * what produces the classic sync loop, where writing the URL triggers a read
 * that dispatches a state change that rewrites the URL.
 */
export function useUrlSyncedFilters(): void {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectFilters);

  // Guards against StrictMode's deliberate double-invocation of effects, which
  // would otherwise hydrate twice, and against the write effect firing before
  // the URL has been read.
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    dispatch(filtersReplaced(decodeFilters(window.location.search)));
  }, [dispatch]);

  useEffect(() => {
    if (!hydrated.current) return;

    const query = encodeFilters(filters);
    const next = query === '' ? window.location.pathname : `${window.location.pathname}?${query}`;

    // replaceState, not pushState. Filters change often — a bar click, a switch,
    // every brush release — and pushing each one would bury the page the user
    // arrived from under dozens of entries. The trade-off is that Back does not
    // step through filter changes; popstate below still keeps Back correct when
    // it leaves the app or returns to a shared link.
    window.history.replaceState(null, '', next);
  }, [filters]);

  useEffect(() => {
    const onPopState = () => {
      dispatch(filtersReplaced(decodeFilters(window.location.search)));
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [dispatch]);
}
