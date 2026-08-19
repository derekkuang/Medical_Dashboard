import { Alert, Box, Checkbox, FormControlLabel, FormGroup, Typography } from '@mui/material';
import { useMemo, useState, type ReactElement } from 'react';
import { ChartCard } from '@/components/ChartCard';
import { RiskIntervals, type RiskChartRow } from '@/charts/RiskIntervals';
import type { SurgeryCase } from '@/data/schema';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { RISK_FACTORS, riskProfile, type RiskFactorKey } from '@/transforms/risk';

interface RiskPanelProps {
  matchedCases: readonly SurgeryCase[];
}

const ROW_HEIGHT = 30;
const CHART_CHROME = 56;

export function RiskPanel({ matchedCases }: RiskPanelProps): ReactElement {
  // Local state: this selects a group to describe, not a cohort to filter the
  // rest of the dashboard by, so it is not part of the shareable filter URL.
  const [selected, setSelected] = useState<RiskFactorKey[]>([]);

  const [containerRef, { width }] = useResizeObserver<HTMLDivElement>();

  const profile = useMemo(() => riskProfile(matchedCases, selected), [matchedCases, selected]);

  const rows: RiskChartRow[] = useMemo(() => {
    const base: RiskChartRow[] = profile.rows.map((r) => ({ ...r }));
    if (profile.combination === null) return base;

    return [
      ...base,
      {
        key: 'combination',
        label: `All ${String(profile.combination.factors.length)} selected together`,
        estimate: profile.combination.observed,
        isCombination: true,
        additivePrediction: profile.combination.additivePrediction,
      },
    ];
  }, [profile]);

  const gap = useMemo(() => {
    const c = profile.combination;
    if (c?.observed == null || c.additivePrediction == null) return null;
    return c.observed.estimate - c.additivePrediction;
  }, [profile]);

  const description = useMemo(() => {
    const baseline = profile.rows.find((r) => r.key === 'baseline')?.estimate;
    if (baseline == null) return 'Not enough recorded outcomes to estimate mortality.';

    const head = `Baseline mortality ${(baseline.estimate * 100).toFixed(2)}% among ${baseline.total.toLocaleString()} patients with none of these factors.`;
    const c = profile.combination;
    if (c?.observed == null) return head;

    return `${head} Patients with all selected factors: ${(c.observed.estimate * 100).toFixed(1)}% of ${String(c.observed.total)}, 95% interval ${(c.observed.lower * 100).toFixed(1)} to ${(c.observed.upper * 100).toFixed(1)}%.`;
  }, [profile]);

  function toggle(key: RiskFactorKey): void {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  return (
    <ChartCard
      title="Mortality by risk factor"
      subtitle="Observed rates with 95% intervals. Combine factors to compare."
    >
      <FormGroup row sx={{ mb: 1, gap: 1 }}>
        {RISK_FACTORS.map((factor) => (
          <FormControlLabel
            key={factor.key}
            control={
              <Checkbox
                size="small"
                checked={selected.includes(factor.key)}
                onChange={() => {
                  toggle(factor.key);
                }}
              />
            }
            label={factor.label}
            slotProps={{ typography: { variant: 'caption' } }}
          />
        ))}
      </FormGroup>

      <div ref={containerRef} style={{ width: '100%' }}>
        {width > 0 && (
          <RiskIntervals
            rows={rows}
            width={width}
            height={rows.length * ROW_HEIGHT + CHART_CHROME}
            description={description}
          />
        )}
      </div>

      {gap !== null && (
        <Alert severity="info" sx={{ mt: 1 }} icon={false}>
          <Typography variant="caption" component="p">
            The dashed line marks what an additive model predicts —
            {` ${((profile.combination?.additivePrediction ?? 0) * 100).toFixed(1)}% `}— by summing
            each factor&rsquo;s marginal difference onto the baseline. The observed rate is
            {` ${Math.abs(gap * 100).toFixed(1)} `}
            percentage points {gap > 0 ? 'higher' : 'lower'}. Risk factors here are correlated and
            do not decompose, which is why this panel reports what happened rather than a sum.
          </Typography>
        </Alert>
      )}

      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" component="p">
          Intervals are Wilson score intervals. Wide bars mean a small group, not a precise estimate
          of a variable rate.
        </Typography>
      </Box>
    </ChartCard>
  );
}
