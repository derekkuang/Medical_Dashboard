import { Box } from '@mui/material';
import { useMemo, type ReactElement } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { useGetCasesQuery } from '@/data/casesApi';
import { allFiltersCleared } from '@/features/filters/filtersSlice';
import { selectFilters } from '@/features/filters/selectors';
import { filterCases } from '@/transforms/filterCases';
import { useUrlSyncedFilters } from '@/hooks/useUrlSyncedFilters';
import { DashboardGrid } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { AgeHistogramPanel } from './AgeHistogramPanel';
import { DepartmentPanel } from './DepartmentPanel';
import { AlbuminPanel } from './AlbuminPanel';
import { CohortRadarPanel } from './CohortRadarPanel';
import { TelemetryPanel } from './TelemetryPanel';
import { PhasePanel } from './PhasePanel';
import { RiskPanel } from './RiskPanel';
import { FilterToolbar } from './FilterToolbar';

export function DashboardContent(): ReactElement {
  useUrlSyncedFilters();

  const dispatch = useAppDispatch();
  const { data, isLoading, isError, error, refetch } = useGetCasesQuery();
  const filters = useAppSelector(selectFilters);

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
          <AgeHistogramPanel allCases={cases} matchedCases={matched} />
          <DepartmentPanel allCases={cases} matchedCases={matched} />
          <RiskPanel matchedCases={matched} />
          <AlbuminPanel matchedCases={matched} />
          <PhasePanel matchedCases={matched} />
          <CohortRadarPanel allCases={cases} />
          {/* Six traces stacked need the full width; at one column this is a
              no-op. */}
          <Box sx={{ gridColumn: { md: '1 / -1' } }}>
            <TelemetryPanel />
          </Box>
        </DashboardGrid>
      )}
    </>
  );
}
