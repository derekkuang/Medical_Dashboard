import { useMemo, type ReactElement } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { DepartmentBars } from '@/charts/DepartmentBars';
import type { SurgeryCase } from '@/data/schema';
import { departmentToggled } from '@/features/filters/filtersSlice';
import { selectFilters } from '@/features/filters/selectors';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { departmentBars, departmentShares, maxDepartmentTotal } from '@/transforms/departments';

interface DepartmentPanelProps {
  allCases: readonly SurgeryCase[];
  matchedCases: readonly SurgeryCase[];
}

const ROW_HEIGHT = 34;
const CHART_CHROME = 52;

export function DepartmentPanel({ allCases, matchedCases }: DepartmentPanelProps): ReactElement {
  const dispatch = useAppDispatch();
  const { department } = useAppSelector(selectFilters);
  const [containerRef, { width }] = useResizeObserver();

  const bars = useMemo(() => departmentBars(allCases, matchedCases), [allCases, matchedCases]);

  const description = useMemo(() => {
    const shares = departmentShares(bars);
    if (shares.length === 0) return 'No departments recorded.';

    const topTwo = shares.slice(0, 2);
    const combined = topTwo.reduce((sum, s) => sum + s.share, 0);

    // The concentration is the single most important caveat on every other
    // statistic here, so it is stated rather than left to be inferred from
    // the bar lengths.
    return `${String(shares.length)} departments. ${topTwo
      .map((s) => `${s.department} ${s.share.toFixed(1)}%`)
      .join(', ')} — together ${combined.toFixed(1)}% of all cases.`;
  }, [bars]);

  // Height follows the row count rather than being fixed: four departments in
  // a 260px box leaves bars floating in whitespace.
  const height = bars.length * ROW_HEIGHT + CHART_CHROME;

  return (
    <ChartCard
      title="Departments"
      subtitle="Cohort against the whole table. Select a bar to filter."
    >
      <div ref={containerRef} style={{ width: '100%' }}>
        {bars.length === 0 ? (
          <EmptyState title="No departments recorded" height={200} />
        ) : (
          width > 0 && (
            <DepartmentBars
              bars={bars}
              maxTotal={maxDepartmentTotal(bars)}
              selected={department}
              onSelect={(next) => dispatch(departmentToggled(next))}
              width={width}
              height={height}
              description={description}
            />
          )
        )}
      </div>
    </ChartCard>
  );
}
