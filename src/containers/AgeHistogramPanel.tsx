import { Box, Button, FormControlLabel, Slider, Stack, Switch, Typography } from '@mui/material';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { AgeHistogram } from '@/charts/AgeHistogram';
import type { SurgeryCase } from '@/data/schema';
import { ageRangeSelected } from '@/features/filters/filtersSlice';
import { selectFilters } from '@/features/filters/selectors';
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

  const dispatch = useAppDispatch();
  const { ageRange } = useAppSelector(selectFilters);
  const [containerRef, { width }] = useResizeObserver<HTMLDivElement>();

  const domain = useMemo(() => ageExtent(allCases), [allCases]);
  const bins = useMemo(
    () => (domain === null ? [] : binAges(matchedCases, domain, 20)),
    [matchedCases, domain],
  );
  const summary = useMemo(() => summariseAges(matchedCases), [matchedCases]);

  const handleBrushChange = useCallback(
    (range: [number, number] | null) => {
      // Rounded to whole years. The brush reports sub-pixel precision, which
      // would otherwise produce URLs like age=41.83027-62.11994.
      dispatch(
        ageRangeSelected(range === null ? null : [Math.round(range[0]), Math.round(range[1])]),
      );
    },
    [dispatch],
  );

  const description =
    summary.median === null
      ? 'No cases with a recorded age.'
      : `${summary.count.toLocaleString()} cases with a recorded age. Median ${summary.median.toFixed(0)} years, ranging from ${String(summary.min)} to ${String(summary.max)}.`;

  const sliderValue: [number, number] =
    ageRange ?? (domain === null ? [0, 1] : [Math.floor(domain[0]), Math.ceil(domain[1])]);

  return (
    <ChartCard
      title="Age distribution"
      subtitle="Drag across the chart to select a range, or use the slider"
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
              brushSelection={ageRange}
              onBrushChange={handleBrushChange}
            />
          )
        )}
      </div>

      {domain !== null && (
        <Box sx={{ px: 1, pt: 1 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            {/* d3-brush is pointer-only. This slider is the keyboard path to the
                same filter — arrow keys move a thumb, Home/End jump to the ends —
                so the control is operable without a mouse rather than the brush
                being the sole affordance. Both write the same store field. */}
            <Slider
              value={sliderValue}
              min={Math.floor(domain[0])}
              max={Math.ceil(domain[1])}
              onChange={(_event, value) => {
                const [lo, hi] = value as [number, number];
                dispatch(ageRangeSelected([lo, hi]));
              }}
              valueLabelDisplay="auto"
              size="small"
              getAriaLabel={(index) => (index === 0 ? 'Minimum age' : 'Maximum age')}
            />
            <Button
              size="small"
              onClick={() => dispatch(ageRangeSelected(null))}
              disabled={ageRange === null}
            >
              Reset
            </Button>
          </Stack>
          <Typography variant="caption" aria-live="polite">
            {ageRange === null
              ? 'All ages'
              : `Ages ${String(ageRange[0])} to ${String(ageRange[1])}`}
          </Typography>
        </Box>
      )}
    </ChartCard>
  );
}
