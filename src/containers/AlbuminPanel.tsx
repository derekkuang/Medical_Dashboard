import { Alert, Typography } from '@mui/material';
import { useMemo, type ReactElement } from 'react';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { AlbuminRisk } from '@/charts/AlbuminRisk';
import type { SurgeryCase } from '@/data/schema';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { albuminIcuRisk, largestStep } from '@/transforms/albumin';

interface AlbuminPanelProps {
  matchedCases: readonly SurgeryCase[];
}

const CHART_HEIGHT = 280;
/** The threshold the original captioned as a cliff. */
const ASSERTED_THRESHOLD = 3.5;

export function AlbuminPanel({ matchedCases }: AlbuminPanelProps): ReactElement {
  const [containerRef, { width }] = useResizeObserver<HTMLDivElement>();

  const bins = useMemo(() => albuminIcuRisk(matchedCases), [matchedCases]);
  const step = useMemo(() => largestStep(bins), [bins]);

  const measured = bins.reduce((sum, b) => sum + (b.estimate?.total ?? 0), 0);

  const description = useMemo(() => {
    const populated = bins.filter((b) => b.estimate !== null);
    if (populated.length < 2) return 'Not enough albumin measurements to describe a trend.';

    const highest = populated.at(-1)?.estimate;
    const lowest = populated[0]?.estimate;
    if (highest == null || lowest == null) {
      return 'Not enough albumin measurements to describe a trend.';
    }

    return `${measured.toLocaleString()} cases with both albumin and an ICU outcome. ICU admission runs from ${(highest.estimate * 100).toFixed(1)}% at the highest albumin to ${(lowest.estimate * 100).toFixed(1)}% at the lowest.`;
  }, [bins, measured]);

  return (
    <ChartCard
      title="Pre-operative albumin and ICU admission"
      subtitle="Share of each albumin band admitted to ICU, with 95% intervals"
    >
      <div ref={containerRef} style={{ width: '100%' }}>
        {measured === 0 ? (
          <EmptyState
            title="No albumin measurements"
            description="No case in this cohort has both a recorded albumin and an ICU outcome."
            height={CHART_HEIGHT}
          />
        ) : (
          width > 0 && (
            <AlbuminRisk
              bins={bins}
              width={width}
              height={CHART_HEIGHT}
              description={description}
              markBoundary={ASSERTED_THRESHOLD}
            />
          )
        )}
      </div>

      {step !== null && measured > 0 && (
        <Alert severity="info" sx={{ mt: 1 }} icon={false}>
          <Typography variant="caption" component="p">
            Risk climbs continuously as albumin falls rather than jumping at one value. The steepest
            single step is at {step.boundary.toFixed(1)} g/dL, worth
            {` ${(step.increase * 100).toFixed(1)} `}
            percentage points
            {step.boundary === ASSERTED_THRESHOLD
              ? '.'
              : `, not at the ${ASSERTED_THRESHOLD.toFixed(1)} g/dL marked by the dashed line.`}{' '}
            This is a gradient, not a cliff — and a straight-line fit, which the original used,
            cannot represent either.
          </Typography>
        </Alert>
      )}
    </ChartCard>
  );
}
