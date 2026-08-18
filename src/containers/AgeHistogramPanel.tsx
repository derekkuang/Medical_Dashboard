import { FormControlLabel, Switch } from '@mui/material';
import { useMemo, useState, type ReactElement } from 'react';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { AgeHistogram } from '@/charts/AgeHistogram';
import type { SurgeryCase } from '@/data/schema';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { ageExtent } from '@/transforms/facets';
import { binAges, maxBinCount, summariseAges } from '@/transforms/histogram';

interface AgeHistogramPanelProps {
  /** The whole table. Fixes the axis domain so it does not move under filtering. */
  allCases: readonly SurgeryCase[];
  /** The current cohort. What actually gets binned. */
  matchedCases: readonly SurgeryCase[];
}

const CHART_HEIGHT = 260;

export function AgeHistogramPanel({
  allCases,
  matchedCases,
}: AgeHistogramPanelProps): ReactElement {
  // Local state, not Redux. This is a view preference rather than part of the
  // cohort selection: it changes what the chart draws, not which cases are in
  // scope, so it does not belong in a shareable filter URL.
  const [splitBySex, setSplitBySex] = useState(false);

  const [containerRef, { width }] = useResizeObserver<HTMLDivElement>();

  const domain = useMemo(() => ageExtent(allCases), [allCases]);
  const bins = useMemo(
    () => (domain === null ? [] : binAges(matchedCases, domain, 20)),
    [matchedCases, domain],
  );
  const summary = useMemo(() => summariseAges(matchedCases), [matchedCases]);

  const description =
    summary.median === null
      ? 'No cases with a recorded age.'
      : `${summary.count.toLocaleString()} cases with a recorded age. Median ${summary.median.toFixed(0)} years, ranging from ${String(summary.min)} to ${String(summary.max)}.`;

  return (
    <ChartCard
      title="Age distribution"
      subtitle="Cases by age, binned into 20 intervals"
      action={
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={splitBySex}
              onChange={(e) => {
                setSplitBySex(e.target.checked);
              }}
            />
          }
          label="Split by sex"
          slotProps={{ typography: { variant: 'caption' } }}
        />
      }
    >
      <div ref={containerRef} style={{ width: '100%' }}>
        {domain === null || summary.count === 0 ? (
          <EmptyState
            title="No ages recorded"
            description="No case in this cohort has a recorded age."
            height={CHART_HEIGHT}
          />
        ) : (
          width > 0 && (
            <AgeHistogram
              bins={bins}
              domain={domain}
              maxCount={maxBinCount(bins)}
              width={width}
              height={CHART_HEIGHT}
              splitBySex={splitBySex}
              description={description}
            />
          )
        )}
      </div>
    </ChartCard>
  );
}
