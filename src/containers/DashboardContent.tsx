import { useMemo, type ReactElement } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { useGetCasesQuery } from '@/data/casesApi';
import { allFiltersCleared } from '@/features/filters/filtersSlice';
import { selectFilters, selectHasActiveFilters } from '@/features/filters/selectors';
import { filterCases } from '@/transforms/filterCases';
import { DashboardGrid } from '@/components/AppShell';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { FilterToolbar } from './FilterToolbar';

/** Panels in the order they will be built. Placeholders until each lands. */
const PLANNED_PANELS = [
  { title: 'Age distribution', subtitle: 'Histogram with brushable range selection' },
  { title: 'Departments', subtitle: 'Case counts, click a bar to filter' },
  { title: 'Procedure phases', subtitle: 'Anaesthesia and operation intervals' },
  { title: 'Pre-operative albumin', subtitle: 'Binned means against ICU stay' },
] as const;

export function DashboardContent(): ReactElement {
  const dispatch = useAppDispatch();
  const { data, isLoading, isError, error, refetch } = useGetCasesQuery();
  const filters = useAppSelector(selectFilters);
  const hasActiveFilters = useAppSelector(selectHasActiveFilters);

  const cases = data?.cases;

  // useMemo rather than createSelector: the source is a query hook result, not
  // store state. The filtering itself is a pure, separately tested transform —
  // memoisation here is only a rendering concern.
  const matched = useMemo(() => (cases ? filterCases(cases, filters) : []), [cases, filters]);

  if (isLoading) {
    return <LoadingState label="Loading 6,388 surgical cases" height={320} />;
  }

  if (isError || cases === undefined) {
    return (
      <ErrorState
        title="Could not load the case table"
        detail={typeof error === 'string' ? error : 'The dataset did not load.'}
        onRetry={() => void refetch()}
        height={320}
      />
    );
  }

  return (
    <>
      <FilterToolbar cases={cases} matchedCount={matched.length} />

      {matched.length === 0 ? (
        <EmptyState
          title="No cases match these filters"
          description="The current combination is too narrow. Widen it or start again."
          action={{ label: 'Clear filters', onClick: () => dispatch(allFiltersCleared()) }}
          height={320}
        />
      ) : (
        <DashboardGrid>
          {PLANNED_PANELS.map((panel) => (
            <ChartCard key={panel.title} title={panel.title} subtitle={panel.subtitle}>
              <EmptyState
                title="Not built yet"
                description={`This panel arrives in phase C. ${matched.length.toLocaleString()} cases are in scope${
                  hasActiveFilters ? ' under the current filters' : ''
                }.`}
              />
            </ChartCard>
          ))}
        </DashboardGrid>
      )}
    </>
  );
}
